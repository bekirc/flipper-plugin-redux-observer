# Flipper Redux Observer

This plugin allows you to observe redux state. 
It is sending diff between old and new states instead of all states to Flipper desktop which makes it faster.

## Installation

```bash
yarn add react-native-flipper flipper-redux-observer
```

## Setup

```js
// index.js
if (__DEV__) {
  const flipperReduxObserver = require('flipper-redux-observer').default;
  middlewares.push(flipperReduxObserver());
}
```
