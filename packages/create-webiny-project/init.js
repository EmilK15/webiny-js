'use strict';

process.on('unhandledRejection', err => {
    throw err;
});

const chalk = require('chalk');
const execSync = require('child_process').execSync;
const fs = require('fs-extra');
const path = require('path');
const spawn = require('cross-spawn');
const os = require('os');

function tryGitInit() {
    try {
      execSync('git --version', { stdio: 'ignore' });
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  
      execSync('git init', { stdio: 'ignore' });
      return true;
    } catch (e) {
      console.warn('Git repo not initialized', e);
      return false;
    }
}

module.exports = function(root, appName, originalDirectory, templateName) {

    const appPackage = require(path.join(root, 'package.json'));

    if(!templateName) {
        console.log('Please provide a template.');
        return;
    }

    const templatePath = path.dirname(
        require.resolve(`${templateName}/package.json`, { paths: [root] })
    );

    let templateJson = {};
    const templateJsonPath = path.join(templatePath, 'package.json');

    if (fs.existsSync(templateJsonPath)) {
        templateJson = require(templateJsonPath);
    }

    // Keys to ignore in templatePackage
    const templatePackageBlacklist = [
        'name',
        'version',
        'description',
        'keywords',
        'bugs',
        'license',
        'author',
        'contributors',
        'files',
        'browser',
        'bin',
        'man',
        'directories',
        'repository',
        'bundledDependencies',
        'optionalDependencies',
        'engineStrict',
        'os',
        'cpu',
        'preferGlobal',
        'private',
        'publishConfig',
    ];

    const templatePackageToReplace = Object.keys(templateJson).filter(key => {
        return !templatePackageBlacklist.includes(key);
    });

    // Add templatePackage keys/values to appPackage, replacing existing entries
    templatePackageToReplace.forEach(key => {
        appPackage[key] = templateJson[key];
    });

    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify(appPackage, null, 2) + os.EOL
    );

    // Copy the files for the user
    const templateDir = path.join(templatePath, 'template');
    if (fs.existsSync(templateDir)) {
        fs.copySync(templateDir, root);
      } else {
        console.error(
          `Could not locate supplied template: ${chalk.green(templateDir)}`
        );
        return;
    }

    // Initialize git repo
    let initializedGit = false;

    if (tryGitInit()) {
        initializedGit = true;
        console.log();
        console.log('Initialized a git repository.');
    }
    const command = 'yarnpkg',
        remove = 'remove';

    let args = ['add'];

    const templateDependencies = appPackage.dependencies;
    if (templateDependencies) {
        args = args.concat(
          Object.keys(templateDependencies).map(key => {
            return `${key}@${templateDependencies[key]}`;
          })
        );
    }

    if(templateName && args.length > 1) {
        console.log(`Installing template dependencies using ${command}...\n`);
        const proc = spawn.sync(command, args, { stdio: 'inherit' });
        if (proc.status !== 0) {
          console.error(`\`${command} ${args.join(' ')}\` failed`);
          return;
        }
    }

    //remove generated files
    const knownGeneratedFiles = [
        'package.json',
        'yarn.lock',
        'node_modules',
    ];
    
    const currentFiles = fs.readdirSync(path.join(originalDirectory));
    currentFiles.forEach(file => {
        knownGeneratedFiles.forEach(fileToMatch => {
            // This removes all knownGeneratedFiles.
            if (file === fileToMatch) {
            console.log(`Deleting generated file... ${chalk.cyan(file)}`);
            fs.removeSync(path.join(originalDirectory, file));
            }
        });
    });

    // Remove template
    console.log(`Removing template package using ${command}...`);
    console.log();

    const proc = spawn.sync(command, [remove, templateName], {
        stdio: 'inherit',
    });
    if (proc.status !== 0) {
        console.error(`\`${command} ${args.join(' ')}\` failed`);
        return;
    }

    // Create git commit if git repo was initialized
    if (initializedGit && tryGitCommit(root)) {
        console.log();
        console.log('Created git commit.');
    }

    // Display how to cd
    let cdpath;
    if (originalDirectory && path.join(originalDirectory, appName) === root) {
        cdpath = appName;
    } else {
        cdpath = root;
    }

    console.log(`Success! Created ${appName} at ${root}`);
    console.log('Inside that directory, you can run several commands:\n');
    console.log('We suggest that you begin by typing:\n');
    console.log(chalk.cyan('  cd'), cdpath);
    console.log('Happy hacking!');
}