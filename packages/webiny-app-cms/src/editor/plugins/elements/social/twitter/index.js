// @flow
import React from "react";
import styled from "react-emotion";
import type { ElementPluginType } from "webiny-app-cms/types";
import { Tab } from "webiny-ui/Tabs";
import { Input } from "webiny-ui/Input";
import { Grid, Cell } from "webiny-ui/Grid";
import { ReactComponent as SocialIcon } from "./../../../elementGroups/social/round-people-24px.svg";
import placeholder from "./placeholder.jpg";
import {
    createEmbedPlugin,
    createEmbedSettingsPlugin
} from "./../../utils/oembed/createEmbedPlugin";

import { ReactComponent as LogoIcon } from "./twitter-brands.svg";

const PreviewBox = styled("div")({
    textAlign: "center",
    height: 50,
    svg: {
        height: 50,
        width: 50
    }
});

export default (): Array<ElementPluginType> => [
    createEmbedPlugin({
        type: "twitter",
        toolbar: {
            title: "Tweet",
            group: "cms-element-group-social",
            preview() {
                return (
                    <PreviewBox>
                        <LogoIcon />
                    </PreviewBox>
                );
            }
        },
        oembed: {
            global: "twttr",
            sdk: "https://platform.twitter.com/widgets.js",
            init({ node }) {
                window.twttr.widgets.load(node);
            }
        },
        renderElementPreview({ width, height }) {
            return <img style={{ width, height }} src={placeholder} alt={"Tweet"} />;
        }
    }),
    createEmbedSettingsPlugin({
        type: "twitter",
        render({ Bind }) {
            return (
                <Tab icon={<SocialIcon />} label="Twitter">
                    <Grid>
                        <Cell span={12}>
                            <Bind name={"data.source.url"} validators={["required", "url"]}>
                                <Input label={"Tweet URL"} description={"Enter a Tweet URL"} />
                            </Bind>
                        </Cell>
                    </Grid>
                </Tab>
            );
        }
    })
];