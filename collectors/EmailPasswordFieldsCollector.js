/* eslint-disable no-await-in-loop */
/* eslint-disable max-lines */
const puppeteer = require('puppeteer');
const BaseCollector = require('./BaseCollector');
const path = require('path');
const fs = require('fs');
const fathomSrc = fs.readFileSync('./helpers/fathomDetect.js', 'utf8');
const pageUtils = require('../helpers/utils.js');
const forms = require('../helpers/formInteraction');
const {createTimer} = require('../helpers/timer');
const tldts = require('tldts');
const {option} = require('commander');
const NATIVE_CLICK = 'native';
const EVENT_BASED_CLICK = 'event-based';
const CLICK_METHODS = [NATIVE_CLICK, EVENT_BASED_CLICK];
const SLEEP_AFTER_EMAIL_FILL = 5000;
const MAX_RELOAD_TIME = 30000;
// constants that determine taking screenshots
const TAKE_SCREENSHOTS_AFTER_PAGE_LOAD = true;
const TAKE_SCREENSHOTS_AFTER_EMAIL_FILLED = true;
const TAKE_SCREENSHOTS_AFTER_PWD_FILLED = true;
const TAKE_SCREENSHOTS_AFTER_EACH_LINK_CLICKED = true;
// constants that determine the email & password filling behavior
const FILL_ONLY_ONE_EMAIL_FIELD = true;
const FILL_ONLY_ONE_PASSWORD_FIELD = true;
const FILL_IN_EMAIL = true;
const FILL_IN_PASSWORD = true;  // only works if FILL_IN_EMAIL is true
const SKIP_EXTERNAL_LINKS = true;
const ALWAYS_RELOAD_BEFORE_CLICKING = true;

class EmailPasswordFieldsCollector extends BaseCollector {

    id() {
        return 'emailPasswordFields';
    }

    /**
     * @param {import('./BaseCollector').CollectorInitOptions} options
     */
    init({log, url}) {

        this._log = log;
        this._url = url;
        this._siteDomain = tldts.getDomain(url.toString());
        this._clickCounter = 0;
        this._numOfPasswordFields = 0;
        this._alreadyFilledEmail = false;
        this._alreadyFilledPassword = false;
        this._enableCMPExtension = true;
        this._numOfEmailFields = 0;
        /** @type {string[]} */
        this._visitedHrefs = [];
        /** @type {string[]} */
        this._emailPasswordFieldsCheckedIFrames = [];
        /**
        * @type  {EmailPasswordFieldsUrlBased[]}
        */
        this._emailPasswordFields = [];
        this._previousNumOfPages = 1;
    }

    /**
    * @param {{cdpClient: import('puppeteer').CDPSession, page: any, type: import('puppeteer').TargetType}} targetInfo
    */
    async addTarget({page, type}) {
        if (page && type === 'page') {
            await page.evaluateOnNewDocument(fathomSrc);
        }
    }

     /**
     * @param {Options} options
     */
    async getData(options) {
        this._options = options;
        this.page = options.page;
        this.finalUrl = options.finalUrl;
        this._log(`EmailAndPaswordsCollector getData called`);
        let fillRes;
        await this.takeScreenshot('after_page_load', this.page, TAKE_SCREENSHOTS_AFTER_PAGE_LOAD);
        // Search for a password field on the landing page
        let emailPasswordFields = await this.findEmailPasswordFieldsOnPageOrFrames(this.page);
        if (emailPasswordFields && (emailPasswordFields.emailFields.length || emailPasswordFields.passwordFields.length)) {
            this._log(`Found email and(or) password field(s) on the homepage on ${this.finalUrl}`);
            this._emailPasswordFields.push(emailPasswordFields);
        } else {
            this._log(`Cannot find a email and(or) password field on the homepage ${this.finalUrl}`);
        }

        if (FILL_IN_EMAIL && emailPasswordFields && (emailPasswordFields.emailFields.length || emailPasswordFields.passwordFields.length)) {
            this._log(`Will fill in email and password on homepage ${this.finalUrl}`);
            fillRes = await this.fillFields(this._url.hostname, emailPasswordFields, this.page);
            if(fillRes.filledPassword) {
                this._log('Password filled on homepage');
            }
            if (fillRes.filledEmail) {
                this._log('Email filled on homepage');
                return {
                    finalEmailPasswordFields: this.removeHandles(this._emailPasswordFields),
                    numEmailFields: this._numOfEmailFields,
                    numPasswordFields: this._numOfPasswordFields,
                    numLinks: 0, loginRegisterLinksDetails: ""
                };
            }
        }

        // Search for a password field on inner pages
        // Get attributes of elements with login/signup etc. expressions
        const loginRegisterLinksAttrs = await pageUtils.getLoginLinkAttrs(this.page, this._log);
        const matchTypeCounts = loginRegisterLinksAttrs.reduce((acc, link) => acc.set(link.matchType, (acc.get(link.matchType) || 0) + 1), new Map());
        this._log(`Found ${loginRegisterLinksAttrs.length} login/register related links on the homepage. Match types: ${[...matchTypeCounts]}`);

        this._log(`Login/register links attributes: ${JSON.stringify(loginRegisterLinksAttrs)}`);

        const NUM_LOGIN_REGISTER_LINKS_TO_CLICK = 10;
        let numClickedLinks = 0;

        for (const loginRegisterLinkAttrs of loginRegisterLinksAttrs) {
            if(numClickedLinks >= NUM_LOGIN_REGISTER_LINKS_TO_CLICK) {
                this._log(`Clicked ${numClickedLinks} (max) elements. Will skip remaining ` +
                    `${loginRegisterLinksAttrs.length - numClickedLinks} !`);
                break;
            }

            if(this._visitedHrefs.includes(loginRegisterLinkAttrs.href)) {
                this._log(`Already visited ${loginRegisterLinkAttrs.href}, will skip this link`);
                continue;
            }

            if (SKIP_EXTERNAL_LINKS  && (loginRegisterLinkAttrs.href !== undefined)) {
                try {
                    const linkDomain = tldts.getDomain(loginRegisterLinkAttrs.href);
                    if (linkDomain && linkDomain !== this._siteDomain) {
                        this._log("External link; will skip", linkDomain, this._siteDomain, loginRegisterLinkAttrs.href);
                        continue;
                    }
                } catch (error) {
                    this._log("Error while getting link domain", loginRegisterLinkAttrs.href, pageUtils.removeNewLineChar(error.message));
                }
            }
            numClickedLinks++;
            emailPasswordFields = await this.clickElementAndFindEmailPasswordFields(loginRegisterLinkAttrs);
            if(emailPasswordFields && loginRegisterLinkAttrs.href) {
                try {
                    const protocol = new URL(loginRegisterLinkAttrs.href).protocol;
                    if(protocol === 'http:' || protocol === 'https:') {
                        this._log('Adding link to the visited URLs: ', loginRegisterLinkAttrs.href);
                        this._visitedHrefs.push(loginRegisterLinkAttrs.href);
                    }
                } catch (error) {
                    this._log('Error while getting URL of the link: ', loginRegisterLinkAttrs.href);
                }
            }

            if (emailPasswordFields && (emailPasswordFields.emailFields.length || emailPasswordFields.passwordFields.length)) {
                // @ts-ignore
                this._log(`Found ${emailPasswordFields.emailFields.length} email` +
                    ` ${emailPasswordFields.passwordFields.length} password field(s)` +
                    ` after clicking ${JSON.stringify(loginRegisterLinkAttrs)}`);
                // @ts-ignore
                this._emailPasswordFields.push(emailPasswordFields);
                if (FILL_IN_EMAIL && emailPasswordFields && (emailPasswordFields.emailFields.length || emailPasswordFields.passwordFields.length)) {
                    let lastUrl = this._lastPage.url();
                    this._log(`Will fill in email after click ${lastUrl}`);
                    fillRes = await this.fillFields(this._url.hostname, emailPasswordFields, this._lastPage);
                    if(fillRes.filledPassword) {
                        await this.takeScreenshot(`after_pwd_filled`, this._lastPage, TAKE_SCREENSHOTS_AFTER_PWD_FILLED);
                        this._log('Password filled on innerpage');
                    }
                    if (fillRes.filledEmail) {
                        this._log('Email filled on innerpage');
                        await this.takeScreenshot(`after_email_filled`, this._lastPage, TAKE_SCREENSHOTS_AFTER_EMAIL_FILLED);
                        break;
                    }
                }
            } else {
                this._log(`Did not find any field` +
                    ` after clicking ${JSON.stringify(loginRegisterLinkAttrs)}`);
            }
        }
        if (!fillRes) {
            this._log(`Could not fill any email fields on the site.`);
        }
        return {
            finalEmailPasswordFields: this.removeHandles(this._emailPasswordFields),
            numEmailFields: this._numOfEmailFields,
            numPasswordFields: this._numOfPasswordFields,
            numLoginLinks: loginRegisterLinksAttrs.length,
            loginRegisterLinksDetails: JSON.stringify(loginRegisterLinksAttrs)
        };
    }

    /**
     * @param {string} hostname
     * @param {EmailPasswordFieldsUrlBased} emailPasswordFields
     * @param {puppeteer.Page} lastPage
     */
    async fillFields(hostname, emailPasswordFields, lastPage) {
        let filledEmail = false;
        let filledPassword = false;
        if(!this._alreadyFilledEmail) {
            for (const emailField of emailPasswordFields.emailFields) {
                filledEmail = await forms.fillEmailField(lastPage, this._current_frame, this._log, hostname, emailField, this._options.emailAddress);
                if(filledEmail && FILL_ONLY_ONE_EMAIL_FIELD) {
                    await this.takeScreenshot(`after_email_filled`, lastPage, TAKE_SCREENSHOTS_AFTER_EMAIL_FILLED);
                    this._alreadyFilledEmail = true;
                    break;
                }
            }
        }

        if (FILL_IN_PASSWORD && !this._alreadyFilledPassword) {
            for (const passwordField of emailPasswordFields.passwordFields) {
                filledPassword = await forms.fillPasswordField(lastPage, this._current_frame, this._log, passwordField, this._options.passwordValue);
                if(filledPassword && FILL_ONLY_ONE_PASSWORD_FIELD) {
                    await this.takeScreenshot(`after_pwd_filled`, lastPage, TAKE_SCREENSHOTS_AFTER_PWD_FILLED);
                    this._alreadyFilledPassword = true;
                    break;
                }
            }
        }

        if(filledEmail || filledPassword) {
            await pageUtils.sleep(SLEEP_AFTER_EMAIL_FILL);
        }

        return  {filledEmail, filledPassword};
    }

    async goToLandingPage() {
        const POST_HOMEPAGE_RELOAD_WAIT = 1000;
        await this.page.bringToFront();
        this._log(`Landing page was brought to front`);
        const pageUrl = await this.page.url();
        // Compare to the landing page (finalUrl)
        if(ALWAYS_RELOAD_BEFORE_CLICKING || (pageUrl !== this.finalUrl)) {
            try {
                this._log(`Navigated away from the landing page. Will load again ${pageUrl} <> ${this.finalUrl}`);
                await this.page.goto(this.finalUrl, {'timeout': MAX_RELOAD_TIME, 'waitUntil': 'load'});
                await this.page.waitForTimeout(POST_HOMEPAGE_RELOAD_WAIT);
                this._log(`Navigated to ${this.page.url()}`);
            } catch (error) {
                this._log(`Error while going back to landing page ${pageUtils.removeNewLineChar(error.message)}`);
            }
        }
    }

    //We need to add elementhandles to emailFields
    //But after collecting data, we can't stringfy this object due to 'Converting circular structure to JSON' error
    //That's why we removed this attribute from the result
    /**
     * @param {EmailPasswordFieldsUrlBased[]} emailPasswordFields
     */
    removeHandles(emailPasswordFields) {
        for (const emailPasswordField of emailPasswordFields) {
            for (const emailField of emailPasswordField.emailFields) {
                Reflect.deleteProperty(emailField, 'elHandle');
            }
            for (const passwordField of emailPasswordField.passwordFields) {
                Reflect.deleteProperty(passwordField, 'elHandle');
            }
        }
        return emailPasswordFields;
    }

    /**
     * @param {puppeteer.ElementHandle} elHandle
     * @param {pageUtils.ElementAttributes} loginRegisterLinkAttrs
     */
    async click(elHandle, loginRegisterLinkAttrs, method = "method1") {
        const oldUrl = await this.page.url();
        this._log(`Will click using ${method} on ${oldUrl} to ${JSON.stringify(loginRegisterLinkAttrs)}`);
        this._clickCounter++;
        this.lastClickedXPath = loginRegisterLinkAttrs.xpath;
        try {
            if (method === NATIVE_CLICK) {
                await elHandle.click();
            } else {
                await this.page.evaluate(el => el.click(), elHandle);
            }
        } catch (error) {
            this._log(`Error while ${method} clicking on ${await this.page.url()} ` +
                `${JSON.stringify(loginRegisterLinkAttrs)} ErrorMsg: ${pageUtils.removeNewLineChar(error.message)}`);
            return false;
        }
        return true;
    }

    async getLastPage() {
        // Return the last page, taking into account newly created pages
        // such as popups, or links opened in news tabs
        let lastPage = this.page;
        const livePages = await this._options.context.pages();
        if(livePages.length > this._previousNumOfPages) {
            lastPage = livePages[livePages.length - 1];
            this._log(`A new page was created, will inject fathom ${lastPage.url()}`);
            await lastPage.evaluate(fathomSrc); // inject fathom by executing the script
            this._previousNumOfPages = livePages.length;
        }
        return lastPage;
    }

    async findEmailPasswordFieldsOnLastPage() {
        this._lastPage = await this.getLastPage();
        const loginRegisterFieldElements = await this.findEmailPasswordFieldsOnPageOrFrames(this._lastPage);
        return loginRegisterFieldElements;
    }

    async waitForNavigation() {
        const POST_CLICK_LOAD_TIMEOUT = 2500;
        let maxWaitTimeInMillisecs = this._options.homepageLoadTime * 1000;

        if(maxWaitTimeInMillisecs <= POST_CLICK_LOAD_TIMEOUT) {
            maxWaitTimeInMillisecs = POST_CLICK_LOAD_TIMEOUT;
        }

        try {
            this._log(`Will wait for navigation ${await this.page.url()}`);
            const clickLoadTimer = createTimer();
            await this.page.waitForNavigation({'timeout': maxWaitTimeInMillisecs, 'waitUntil': 'load'});
            this._log(`Page load after click took ${clickLoadTimer.getElapsedTime()}s`);
            await this.page.waitForTimeout(maxWaitTimeInMillisecs);
        } catch (error) {
            this._log(`Error while waiting navigation ${await this.page.url()} ${pageUtils.removeNewLineChar(error.message)}`);
        }
    }

    /**
     * @param {pageUtils.ElementAttributes} loginRegisterLinkAttrs
     * @returns {Promise<EmailPasswordFieldsUrlBased>}
     */
    async clickElementAndFindEmailPasswordFields(loginRegisterLinkAttrs) {
        let emailPasswordFields;
        for (const method of CLICK_METHODS) {
            await this.goToLandingPage();
            let elementHandle = await pageUtils.getElementHandleFromXPath(this.page, loginRegisterLinkAttrs.xpath);
            if(!elementHandle) {
                this._log(`Cannot find element with XPATH: ${loginRegisterLinkAttrs.xpath}.`);
                return undefined;
            }
            const preClickUrl = await this.page.url();
            const clickOk = await this.click(elementHandle, loginRegisterLinkAttrs, method);
            if (clickOk) {
                await this.waitForNavigation();
                emailPasswordFields = await this.findEmailPasswordFieldsOnLastPage();
                await this.takeScreenshot(`after_click_${this._clickCounter}`, this._lastPage, TAKE_SCREENSHOTS_AFTER_EACH_LINK_CLICKED);
                if (emailPasswordFields && (emailPasswordFields.emailFields.length || emailPasswordFields.passwordFields.length)) {
                    return emailPasswordFields;
                }
                const postClickUrl = await this.page.url();
                if (postClickUrl !== preClickUrl) {
                    this._log(`Native click worked. Will skip event-based click ${preClickUrl} <> ${postClickUrl}`);
                    return emailPasswordFields;
                }
            }
        }
        return emailPasswordFields;
    }


    /**
     * @param {puppeteer.Page} page
     * @returns {Promise<puppeteer.ElementHandle<Element>[]>}
     */
    async getPasswordFieldHandles(page) {
        const listHandle = await page.evaluateHandle(() => {
            const passElements = [...document.querySelectorAll('input[type=password]')];
            // Filter out invisible elements
            return passElements.filter(formEl => !formEl.disabled &&
                formEl.getAttribute("aria-hidden") !== "true");
        });
        return pageUtils.getHandlesFromListHandle(listHandle);
    }

    /**
     * @param {puppeteer.Page} page
     * @param {string} pageUrl
     */
    async getPasswordFields(page, pageUrl) {
        const elHandles = await this.getPasswordFieldHandles(page);
        let passwordFields = [];
        for (const handle of elHandles) {
            let elAttributes = await pageUtils.getElementAttrs(handle, pageUrl, true, this._log);
            elAttributes.elHandle = handle;
            passwordFields.push(elAttributes);
        }
        if (passwordFields.length) {
            this._log(`Found ${passwordFields.length} password field(s): ` +
            `${this.stringfyObjIncludesHandleEl(passwordFields)} on ${pageUrl}`);
        }
        return passwordFields;
    }

    /**
     * @param {puppeteer.Page} page
     */
    async findEmailPasswordFieldsOnPageOrFrames(page) {
        let emailPasswordFields = await this.findEmailPasswordFields(page);
        if(emailPasswordFields && emailPasswordFields.emailFields.length) {
            this._log(`Found ${emailPasswordFields.emailFields.length} email` +
            ` ${emailPasswordFields.passwordFields.length} password field(s) on the page: ${page.url()}`);
            return emailPasswordFields;
        }

        const iFrames = await page.frames();
        for (const frame of iFrames) {
            if(frame.isDetached()) {
                return undefined;
            }
            const frameUrl = frame.url();
            const frameId = frame._id;
                //If the parent frame exist, then this frame is top frame, not require to check it
            if (frameUrl && frameUrl !== 'about:blank' &&
                frame._parentFrame && !this._emailPasswordFieldsCheckedIFrames.includes(frameId)) {
                await frame.evaluate(fathomSrc); // inject fathom by executing the script
                emailPasswordFields = await this.findEmailPasswordFields(frame);
                this._emailPasswordFieldsCheckedIFrames.push(frameId);//not find email and password fields on the frames already checked
                if(emailPasswordFields && emailPasswordFields.emailFields.length) {
                    this._log(`Found ${emailPasswordFields.emailFields.length} email` +
                    ` ${emailPasswordFields.passwordFields.length} password field(s) on subframe: ${frameUrl} ${frameId}`);
                    this._current_frame = frame;
                    return emailPasswordFields;
                }
            }
        }
        return emailPasswordFields;
    }

    /**
     * @param {any} pageorFrame
     * @returns {Promise<EmailPasswordFieldsUrlBased>}
     */
    async findEmailPasswordFields(pageorFrame) {
        /**
        * @type  {String}
        */
        const pageUrl = pageorFrame.url();
        const pageDomain = tldts.getDomain(pageUrl);
        if (SKIP_EXTERNAL_LINKS && (this._siteDomain !== pageDomain)) {
            this._log(`Off-domain navigation. Will not search for email/password fields on ${pageUrl}`);
            return undefined;
        }
        this._log(`Will search for email/password fields on ${pageUrl}`);
        try {
            const emailFields = await this.getEmailFields(pageorFrame, pageUrl);
            const passwordFields = await this.getPasswordFields(pageorFrame, pageUrl);
            this._numOfEmailFields += emailFields.length;
            this._numOfPasswordFields += passwordFields.length;
            return {
                location: pageUrl,
                passwordFields,
                emailFields,
                clickedElementXPath: this.lastClickedXPath,
            };
        } catch (error) {
            this._log(`Error on ${pageUrl} while searching email/password fields: ${pageUtils.removeNewLineChar(error.message)}`);
        }
        return undefined;
    }

    /**
     * @param {any} page
     * @param {string} pageUrl
     */
    async getEmailFields(page, pageUrl) {
        let emailFields = [];
        // @ts-ignore
        // eslint-disable-next-line no-undef
        const emailFieldsFromFathom = await page.evaluate(() => [...fathom.detectEmailInputs(document)]);

        for (const emailField of emailFieldsFromFathom) {
            let elementHandle = await pageUtils.getElementHandleFromXPath(page, emailField.xpath);
            if(!elementHandle) {
                this._log(`Cannot find element with XPATH: ${emailField.xpath}.`);
                continue;
            }
            let elAttributes = await pageUtils.getElementAttrs(elementHandle, pageUrl, true, this._log);
            // @ts-ignore
            elAttributes.elHandle = elementHandle;
            elAttributes.score = emailField.score;
            emailFields.push(elAttributes);
        }
        if (emailFields.length) {
            this._log(`Found ${emailFields.length} email field(s): ${this.stringfyObjIncludesHandleEl(emailFields)} on ${pageUrl}`);
        }
        return emailFields;
    }

       /**
     * @param {any[]} emailFields
     */
    stringfyObjIncludesHandleEl(emailFields) {
        //Hide certain values in emailFields based on https://stackoverflow.com/a/61196684
        const privateProperties = ["elHandle"];
        const excludePrivateProperties = (key, value) => (privateProperties.includes(key) ? undefined : value);
        return JSON.stringify(emailFields, excludePrivateProperties);
    }

    /**
     * @param {string} fileName
     * @param {puppeteer.Page} page
     * @param {boolean} ssEnabled
     */
    async takeScreenshot(fileName, page, ssEnabled) {
        if(!ssEnabled) {return;}
        const filePath = path.join(this._options.outputPath, `${this._url.hostname}_${fileName}.png`);
        await page.screenshot({path: filePath});
        this._log(`Screenshot saved at: ${filePath}`);
    }

}

module.exports = EmailPasswordFieldsCollector;

/**
 * @typedef EmailPasswordFieldsUrlBased
 * @property {string} location
 * @property {pageUtils.ElementAttributes[]} passwordFields
 * @property {pageUtils.ElementAttributes[]} emailFields
 * @property {string} clickedElementXPath
 */

 /**
 * @typedef Options
 * @property {string} finalUrl
 * @property {function(string):boolean} urlFilter?
 * @property {puppeteer.Page} page
 * @property {string} outputPath
 * @property {puppeteer.BrowserContext} context
 * @property {Number} homepageLoadTime
 * @property {boolean} emulateMobile
 * @property {string} emailAddress
 * @property {string} passwordValue
 */