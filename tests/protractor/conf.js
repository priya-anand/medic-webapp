const utils = require('./utils'),
      constants = require('./constants'),
      auth = require('./auth')();
const moduleManager = require('./module-manager');

if (!process.env.COUCH_NODE_NAME) {
  throw new Error('Missing required env var: COUCH_NODE_NAME');
}

const getLoginUrl = () => {
  const redirectUrl = encodeURIComponent(`/${constants.DB_NAME}/_design/medic/_rewrite/#/messages`);
  return `http://${constants.API_HOST}:${constants.API_PORT}/${constants.DB_NAME}/login?redirect=${redirectUrl}`;
};

const login = browser => {
  browser.driver.get(getLoginUrl());
  browser.driver.findElement(by.name('user')).sendKeys(auth.user);
  browser.driver.findElement(by.name('password')).sendKeys(auth.pass);
  browser.driver.findElement(by.id('login')).click();
  // Login takes some time, so wait until it's done.
  const bootstrappedCheck = () => element(by.css('body.bootstrapped')).isPresent();
  return browser.driver.wait(bootstrappedCheck, 20 * 1000, 'Login should be complete within 20 seconds');
};

const startApi = () => startNodeModule('api', 'Medic API listening on port');

const startSentinel = () => startNodeModule('sentinel', 'startup complete.');

// start sentinel serially because it relies on api.
const startModules = () => startApi().then(startSentinel);

const setupSettings = () => {
  return utils.request({
    path: `/${constants.DB_NAME}/_design/medic/_rewrite/update_settings/medic`,
    method: 'PUT',
    body: JSON.stringify({ setup_complete: true })
  });
};

const setupUser = () => {
  return utils.getDoc('org.couchdb.user:' + auth.user)
    .then(doc => {
      doc.known = true;
      doc.language = 'en';
      doc.roles = ['_admin'];
      return utils.saveDoc(doc);
    });
};

// From orbit, just to be sure
process.on('exit', moduleManager.stopAll);

exports.config = {
  seleniumAddress: 'http://localhost:4444/wd/hub',
  // specs: ['e2e/**/*.js'],
  specs: ['e2e/api/**/*.js'],
  framework: 'jasmine2',
  capabilities: {
    browserName: 'chrome',
    chromeOptions: {
      args: ['--headless', '--disable-gpu', '--window-size=1024,768']
    }
    // browserName: 'firefox',
    // 'marionette':'true'
  },
  beforeLaunch: function() {
    process.on('uncaughtException', function() {
      utils.reporter.jasmineDone();
      utils.reporter.afterLaunch();
    });
    return new Promise(function(resolve) {
      utils.reporter.beforeLaunch(resolve);
    });
  },
  onPrepare: () => {
    jasmine.getEnv().addReporter(utils.reporter);
    browser.waitForAngularEnabled(false);

    if(module.exports.manageModules) {
      const startup = startModules();
      browser.driver.wait(startup, 60 * 1000, 'API and Sentinel should start within 60 seconds');
      browser.driver.sleep(1000);
    }

    browser.driver.wait(setupSettings, 5 * 1000, 'Settings should be setup within 5 seconds');
    browser.driver.wait(setupUser, 5 * 1000, 'User should be setup within 5 seconds');
    browser.driver.sleep(1000);
    return login(browser);
  },
  onCleanUp: moduleManager.stopAll,
  manageModules: true,
};
