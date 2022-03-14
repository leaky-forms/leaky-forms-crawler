// eslint-disable-next-line
const puppeteer = require('puppeteer');
const {sleep} = require('./utils.js');
/**
 * @param {number} maxValue
 */
function getRandomUpTo(maxValue) {
    return Math.random() * maxValue;
}


/**
 * @param {puppeteer.ElementHandle} elementHandle
 */
async function getElementAttrs(elementHandle) {
    const boundingBox = await elementHandle.boundingBox();
    const inViewPort = await elementHandle.isIntersectingViewport();
    const elAttrs = await elementHandle.evaluate(el => ({
        id: el.id,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        placeholder: el.getAttribute('placeholder')
    }), elementHandle);
    return Object.assign(elAttrs, boundingBox, {inView: inViewPort});
}

/**
 * @param {puppeteer.ElementHandle} elementHandle
 */
async function scrollToElement(elementHandle) {
    await elementHandle.evaluate(el => {
        el.scrollIntoView({behavior: 'smooth', block: 'end', inline: 'end'});
    });
}

/**
 * @param {puppeteer.Page} page
 * @param {function(...any):void} log
 * @param {any} element
 * @param {string} text
 */
async function fillInputElement(page, log, element, text) {
    // Keyboard events emitted by the below code match events from
    // manual typing. Tested at
    // https://w3c.github.io/uievents/tools/key-event-viewer
    const KEY_PRESS_DWELL_TIME = 100;
    const CLICK_DWELL_TIME = 100;
    const DELAY_BETWEEN_KEYS = 250;
    const elementHandle = element.elHandle;
    const elAttributes = {...element, elHandle: undefined};
    log(`Will fill ${text} to input field: ${JSON.stringify(elAttributes)}`);
    // scroll down to the element
    await scrollToElement(elementHandle);
    await elementHandle.hover();
    await elementHandle.click({delay: CLICK_DWELL_TIME});
    for (const key of text) {
        let randDelayDwellTime = getRandomUpTo(KEY_PRESS_DWELL_TIME);
        let randDelayBetweenPresses = getRandomUpTo(DELAY_BETWEEN_KEYS);
        // eslint-disable-next-line no-await-in-loop
        await elementHandle.type(key, {delay: randDelayDwellTime});  // delay -> dwell time
        // eslint-disable-next-line no-await-in-loop
        await sleep(randDelayBetweenPresses);
    }
    await page.keyboard.press("Tab");  // to trigger blur
    return true;
}

/**
 * @param {puppeteer.Page} page
 * @param {puppeteer.Frame} frame
 * @param {function(...any):void} log
 * @param {any} passwordField
 * @param {string} passwordValue
 */
async function fillPasswordField(page, frame, log, passwordField, passwordValue) {
    let success = false;
    const PASSWD = passwordValue;
    try{
        let pageOrFrame = page;
        if(frame) {
            // @ts-ignore
            pageOrFrame = frame;
        }
        const pwdFieldHandle = passwordField.elHandle;
        if (!pwdFieldHandle) {
            log(`Cannot find a password field`);
            return false;
        }

        await fillInputElement(page, log, passwordField, PASSWD);
        success = true;
        log(`Successfully filled the password field ${JSON.stringify({...passwordField, elHandle: undefined})}`);
    }catch(e) {
        log(`Cannot fill the password field: ${JSON.stringify({...passwordField, elHandle: undefined})} , error_msg: ${e.message}`);
    }
    return success;
}


/**
 * @param {puppeteer.Page} page
 * @param {puppeteer.Frame} frame
 * @param {function(...any):void} log
 * @param {string} hostname
 * @param {any} emailField
 * @param {string} emailAddress
 */
async function fillEmailField(page, frame, log, hostname, emailField, emailAddress) {
    let pageOrFrame = page;
    if(frame) {
         // @ts-ignore
        pageOrFrame = frame;
    }
    let success = false;
    let emailSuffix = hostname;
    if (emailSuffix.startsWith('www.')) {
        emailSuffix = emailSuffix.substr(4, emailSuffix.length);
    }
    let emailToFill = emailAddress.split('@')[0] + '+' + emailSuffix + '@' + emailAddress.split('@')[1];
    let fieldHandle = emailField.elHandle;


    try{
        // improve email field detection
        if (!fieldHandle) {
            log(`Cannot find an email field`);
            return false;
        }
        // fill the email field
        await fillInputElement(page, log, emailField, emailToFill);
        success = true;
        log(`Successfully filled the email field ${JSON.stringify({...emailField, elHandle: undefined})}`);
    }catch(e) {
        log(`Cannot fill the email field: ${JSON.stringify({...emailField, elHandle: undefined})} , error_msg: ${e.message}`);
    }
    return success;
}

module.exports = {
    fillEmailField,
    fillPasswordField
};