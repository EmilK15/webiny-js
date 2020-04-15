'use strict';

process.on('unhandledRejection', err => {
    throw err;
});

const chalk = require('chalk');
const execSync = require('child_process').execSync;
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

function tryGitInit() {
    try {
      execSync('git --version', { stdio: 'ignore' });
      if (isInGitRepository() || isInMercurialRepository()) {
        return false;
      }
  
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

    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify(appPackage, null, 2) + os.EOL
    );

    // modifies README.md commands based on user used package manager.
    try {
        const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
        fs.writeFileSync(
            path.join(root, 'README.md'),
            readme.replace(/(npm run |npm )/g, 'yarn '),
            'utf8'
        );
    } catch (err) {
        // Silencing the error. As it fall backs to using default npm commands.
    }

    const gitignoreExists = fs.existsSync(path.join(root, '.gitignore'));
    if (gitignoreExists) {
        // Append if there's already a `.gitignore` file there
        const data = fs.readFileSync(path.join(root, 'gitignore'));
        fs.appendFileSync(path.join(root, '.gitignore'), data);
        fs.unlinkSync(path.join(root, 'gitignore'));
    } else {
        // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
        // See: https://github.com/npm/npm/issues/1862
        fs.moveSync(
            path.join(root, 'gitignore'),
            path.join(root, '.gitignore'),
            []
        );
    }

    // Initialize git repo
    let initializedGit = false;

    if (tryGitInit()) {
        initializedGit = true;
        console.log();
        console.log('Initialized a git repository.');
    }
    const command = 'yarnpkg',
        remove = 'remove',
        args = ['add'];
    
    const templateDependencies = templatePackage.dependencies || templateJson.dependencies;
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
    console.log(chalk.cyan('yarn start'));
    console.log('    Starts the development server.\n');
    console.log(chalk.cyan(`  yarn build`));
    console.log('    Bundles the app into static files for production.\n');
    console.log('We suggest that you begin by typing:');
    console.log();
    console.log(chalk.cyan('  cd'), cdpath);
    console.log(`  ${chalk.cyan('yarn start')}`);
    console.log('Happy hacking!');
}