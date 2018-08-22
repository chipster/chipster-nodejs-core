# Common Chipster libraries for JavaScript

https://github.com/chipster/chipster-js-common

## Usage

```bash
npm install chipster-js-common --save
```

## Changes
### Test locally
* Link the local project

```bash
cd ~/git/chipster-js-common/
npm link
cd ~/git/YOUR_PROJECT/
npm link chipster-js-common
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

* Update the version number in the package.json of your project
* Install it

```bash
npm install
```