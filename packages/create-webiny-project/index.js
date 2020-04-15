#!/usr/bin/env node
const chalk = require("chalk");
const dns = require('dns');
const envinfo = require("envinfo");
const execSync = require('child_process').execSync;
const fs = require('fs-extra');
const hyperquest = require('hyperquest');
const os = require('os');
const path = require('path');
const spawn = require('cross-spawn');
const tmp = require('tmp');
const yargs = require("yargs");
const validateProjectName = require('validate-npm-package-name');

const packageJson = require("./package.json");

const templates = ['basic'];

yargs
    .usage("Usage: $0 <project-name> [options]")
    .version(packageJson.version)
    .demandCommand(1)
    .example("$0 helloWorld --template=basic")
    .help()
    .alias("help", "h")
    .fail(function(msg, err) {
      if (msg) console.log(msg);
      if (err) console.log(err);
      process.exit(1);      
    });

yargs.command(
    "$0 <project-name>",
    "Name of application and template to use",
    yargs => {
      yargs.positional("project-name", {
        describe: "Project name"
      });
      yargs.option("template", {
        describe: "Name of template to use",
        alias: "t",
        type: "string",
        demandOption: true,
      });
    },
    (argv) => createApp(argv.projectName, argv.template))
    .argv;

yargs.command(
    "info",
    "Print environment debug information",
    {},
    () => informationHandler())
    .argv;

function checkAppName(appName) {
  const validationResult = validateProjectName(appName);
  if (!validationResult.validForNewPackages) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green(
          `"${appName}"`
        )} because of npm naming restrictions:\n`
      )
    );
    [
      ...(validationResult.errors || []),
      ...(validationResult.warnings || []),
    ].forEach(error => {
      console.error(chalk.red(`  * ${error}`));
    });
    console.error(chalk.red('\nPlease choose a different project name.'));
    process.exit(1);
  }
};

function checkIfOnline() {
  return new Promise(resolve => {
    dns.lookup('registry.yarnpkg.com', err => {
      let proxy;
      if (err != null && (proxy = getProxy())) {
        // If a proxy is defined, we likely can't resolve external hostnames.
        // Try to resolve the proxy name as an indication of a connection.
        dns.lookup(url.parse(proxy).hostname, proxyErr => {
          resolve(proxyErr == null);
        });
      } else {
        resolve(err == null);
      }
    });
  });
}

function createApp(projectName, template) {
  if(!projectName) {
    console.log('You must provide a name for the project to use.');
  } else {
    if(template === 'basic') {
      const root = path.resolve(projectName);
      const appName = path.basename(root);

      checkAppName(appName);
      fs.ensureDirSync(projectName);

      console.log();

      console.log(`Creating your webiny app in ${chalk.green(root)}.`);
      console.log();

      const packageJson = {
        name: appName,
        version: '0.1.0',
        private: true,
      };
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify(packageJson, null, 2) + os.EOL
      );
      const originalDirectory = process.cwd();

      // //for yarn usage
      // let yarnUsesDefaultRegistry;
      // try {
      //   yarnUsesDefaultRegistry =
      //     execSync('yarnpkg config get registry')
      //       .toString()
      //       .trim() === 'https://registry.yarnpkg.com';
      // } catch (e) {
      //   // ignore
      // }
      // if (yarnUsesDefaultRegistry) {
      //   fs.copySync(
      //     require.resolve('./yarn.lock.cached'),
      //     path.join(root, 'yarn.lock')
      //   );
      // }

      run(root, appName, originalDirectory, template);
    } else {
      console.log('Invalid template, we currently support "basic".')
    }
  }
}

function getPackageInfo(installPackage) {
  if (installPackage.match(/^.+\.(tgz|tar\.gz)$/)) {
    return getTemporaryDirectory()
      .then(obj => {
        let stream;
        if (/^http/.test(installPackage)) {
          stream = hyperquest(installPackage);
        } else {
          stream = fs.createReadStream(installPackage);
        }
        return extractStream(stream, obj.tmpdir).then(() => obj);
      })
      .then(obj => {
        const { name, version } = require(path.join(
          obj.tmpdir,
          'package.json'
        ));
        obj.cleanup();
        return { name, version };
      })
      .catch(err => {
        // The package name could be with or without semver version, e.g. react-scripts-0.2.0-alpha.1.tgz
        // However, this function returns package name only without semver version.
        console.log(
          `Could not extract the package name from the archive: ${err.message}`
        );
        const assumedProjectName = installPackage.match(
          /^.+\/(.+?)(?:-\d+.+)?\.(tgz|tar\.gz)$/
        )[1];
        console.log(
          `Based on the filename, assuming it is "${chalk.cyan(
            assumedProjectName
          )}"`
        );
        return Promise.resolve({ name: assumedProjectName });
      });
  } else if (installPackage.startsWith('git+')) {
    // Pull package name out of git urls e.g:
    // git+https://github.com/mycompany/react-scripts.git
    // git+ssh://github.com/mycompany/react-scripts.git#v1.2.3
    return Promise.resolve({
      name: installPackage.match(/([^/]+)\.git(#.*)?$/)[1],
    });
  } else if (installPackage.match(/.+@/)) {
    // Do not match @scope/ when stripping off @version or @tag
    return Promise.resolve({
      name: installPackage.charAt(0) + installPackage.substr(1).split('@')[0],
      version: installPackage.split('@')[1],
    });
  } else if (installPackage.match(/^file:/)) {
    const installPackagePath = installPackage.match(/^file:(.*)?$/)[1];
    const { name, version } = require(path.join(
      installPackagePath,
      'package.json'
    ));
    return Promise.resolve({ name, version });
  }
  return Promise.resolve({ name: installPackage });
}

function getTemplateInstallPackage(template, originalDirectory) {
  let templateToInstall = 'cwp-template';
  if (template) {
    if (template.match(/^file:/)) {
      templateToInstall = `file:${path.resolve(
        originalDirectory,
        template.match(/^file:(.*)?$/)[1]
      )}`;
    } else if (
      template.includes('://') ||
      template.match(/^.+\.(tgz|tar\.gz)$/)
    ) {
      // for tar.gz or alternative paths
      templateToInstall = template;
    } else {
      // Add prefix 'cwp-template-' to non-prefixed templates, leaving any
      // @scope/ intact.
      const packageMatch = template.match(/^(@[^/]+\/)?(.+)$/);
      const scope = packageMatch[1] || '';
      const templateName = packageMatch[2];

      if (
        templateName === templateToInstall ||
        templateName.startsWith(`${templateToInstall}-`)
      ) {
        // Covers:
        // - cwp-template-basic
        // - @SCOPE/cwp-template-basic
        // - cwp-template-NAME
        // - @SCOPE/cwp-template-NAME
        templateToInstall = `${scope}${templateName}`;
      } else if (templateName.startsWith('@')) {
        // Covers using @SCOPE only
        templateToInstall = `${templateName}/${templateToInstall}`;
      } else {
        // Covers templates without the `cwp-template` prefix:
        // - NAME
        // - @SCOPE/NAME
        templateToInstall = `${scope}${templateToInstall}-${templateName}`;
      }
    }
  }

  return Promise.resolve(templateToInstall);
}

function getTemporaryDirectory() {
  return new Promise((resolve, reject) => {
    // Unsafe cleanup lets us recursively delete the directory if it contains
    // contents; by default it only allows removal if it's empty
    tmp.dir({ unsafeCleanup: true }, (err, tmpdir, callback) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          tmpdir: tmpdir,
          cleanup: () => {
            try {
              callback();
            } catch (ignored) {
              // Callback might throw and fail, since it's a temp directory the
              // OS will clean it up eventually...
            }
          },
        });
      }
    });
  });
}

function informationHandler() {
  console.log(chalk.bold("\nEnvironment Info:"));
  console.log(
      `\n  current version of ${packageJson.name}: ${packageJson.version}`
  );
  console.log(`  running from ${__dirname}`);
  return envinfo
    .run(
      {
        System: ["OS", "CPU"],
        Binaries: ["Node", "npm", "Yarn"],
        Browsers: ["Chrome", "Edge", "Internet Explorer", "Firefox", "Safari"],
        npmGlobalPackages: ["create-webiny-project"],
      },
      {
        duplicates: true,
        showNotFound: true,
      }
    )
    .then(console.log);    
};

function install(root, dependencies, isOnline) {
  return new Promise((resolve, reject) => {
    const command = 'yarnpkg';
    const args = ['add', '--exact'];

    if (!isOnline) {
      args.push('--offline');
    }

    console.log(dependencies);
    [].push.apply(args, dependencies);

    // Explicitly set cwd() to work around issues like
    // https://github.com/facebook/create-react-app/issues/3326.
    args.push('--cwd');
    args.push(root);

    if (!isOnline) {
      console.log(chalk.yellow('You appear to be offline.'));
      console.log(chalk.yellow('Falling back to the local Yarn cache.'));
      console.log();
    }

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}

function run(root, appName, originalDirectory, template) {
  Promise.all([
    getTemplateInstallPackage(template, originalDirectory)
  ]).then(([templateToInstall]) => {
    console.log('Installing packages. This might take a couple of minutes.');
    const allDependencies = [];
    Promise.all([
      getPackageInfo(templateToInstall),
    ])
    .then(([templateInfo]) => 
      checkIfOnline().then(isOnline => ({
        isOnline,
        templateInfo,
      }))
    )
    .then(({ isOnline, templateInfo }) => {
      allDependencies.push(templateInfo.name);
      return install(
        root,
        allDependencies,
        isOnline,
      ).then(() => ({
        templateInfo,
      }));
    })
    .then(async ({ templateInfo }) => {
      /**
       * 
        await executeNodeScript(
          {
            cwd: process.cwd(),
            args: nodeArgs,
          },
          [root, appName, originalDirectory, templateName],
          `
        var init = require('${packageName}/scripts/init.js');
        init.apply(null, JSON.parse(process.argv[1]));
      `
        );
       */
    })
    .catch(reason => {
      console.log();
      console.log('Aborting installation.');
      if (reason.command) {
        console.log(`  ${chalk.cyan(reason.command)} has failed.`);
      } else {
        console.log(
          chalk.red('Unexpected error. Please report it as a bug:')
        );
        console.log(reason);
      }
      console.log();
      console.log('Done.');
      process.exit(1);
    });
  });
};