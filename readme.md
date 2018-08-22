# Common Chipster libraries for Node.js

https://github.com/chipster/chipster-nodejs-core

## Usage

```bash
npm install chipster-nodejs-core@latest --save
```

## Changes
### Test locally
* Link the local project

```bash
cd ~/git/chipster-nodejs-core/
npm link
cd ~/git/YOUR_PROJECT/
npm link chipster-nodejs-core
```

* Do your changes
* Compile this project

```bash
tsc
```

* Compile your project
* Repeat from start until ready
* Remove the local link

```bash
npm install
```

### Publish

* Bump the version number in package.json
* Publish it to npmjs.com

```bash
npm publish
```

* Install the latest version to your project

```bash
npm install chipster-nodejs-core@latest
```