/* eslint-disable max-lines */
const puppeteer = require('puppeteer');
const SLEEP_TIME_FOR_CMP_DETECTION = 300;
const POST_CMP_DETECTION_WAIT_TIME = 2500;
const ENABLE_LOOSE_LOGIN_LINK_MATCHES = true;
// whether we search for links that are closest to coordinates
// where find most login links
const ENABLE_COORD_BASED_LINK_SEARCH = true;
//crawlResDF.time_until_cmp_detected.quantile(0.99) -->5.8
const MAX_WAIT_TIME_FOR_CMP_DETECTION = 6000;
// Regexes are taken from:
// https://searchfox.org/mozilla-central/rev/5e70cd673a0ba0ad19b662c1cf656e0823781596/toolkit/components/passwordmgr/NewPasswordModel.jsm#105-109
const loginRegex = /login|log in|log on|log-on|Войти|sign in|sigin|sign\/in|sign-in|sign on|sign-on|ورود|登录|Přihlásit se|Přihlaste|Авторизоваться|Авторизация|entrar|ログイン|로그인|inloggen|Συνδέσου|accedi|ログオン|Giriş Yap|登入|connecter|connectez-vous|Connexion|Вход/i;
const loginFormAttrRegex = /login|log in|log on|log-on|sign in|sigin|sign\/in|sign-in|sign on|sign-on/i;
const registerStringRegex = /create[a-zA-Z\s]+account|Zugang anlegen|Angaben prüfen|Konto erstellen|register|sign up|ثبت نام|登録|注册|cadastr|Зарегистрироваться|Регистрация|Bellige alynmak|تسجيل|ΕΓΓΡΑΦΗΣ|Εγγραφή|Créer mon compte|Mendaftar|가입하기|inschrijving|Zarejestruj się|Deschideți un cont|Создать аккаунт|ร่วม|Üye Ol|registr|new account|ساخت حساب کاربری|Schrijf je/i;
const registerActionRegex = /register|signup|sign-up|create-account|account\/create|join|new_account|user\/create|sign\/up|membership\/create/i;
const registerFormAttrRegex = /signup|join|register|regform|registration|new_user|AccountCreate|create_customer|CreateAccount|CreateAcct|create-account|reg-form|newuser|new-reg|new-form|new_membership/i;
const loginRegexExtra = /log_in|logon|log_on|signin|sign_in|sign_up|signon|sign_on|Aanmelden/i;
const combinedLoginLinkRegexLooseSrc = [loginRegex.source, loginFormAttrRegex.source, registerStringRegex.source, registerActionRegex.source, registerFormAttrRegex.source, loginRegexExtra.source].join('|');
const combinedLoginLinkRegexExactSrc = '^' + combinedLoginLinkRegexLooseSrc.replace(/\|/g, '$|^') + '$';

/**
 * @param {number} time
 */
function sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

/**
 * @param {puppeteer.Page} page
 * @param {string} xpath
 * @returns puppeteer.ElementHandle
 */
async function getElementHandleFromXPath(page, xpath) {
    return (await page.$x(xpath))[0];
}
/**
 * @param {puppeteer.ElementHandle} elHandle
 * @returns {Promise<string>} xpath
 */
async function getXPathFromHandle(elHandle) {
    const xpath = await elHandle.evaluate(el => (fathom && fathom.getXPath(el)), elHandle);
    return xpath;
}


/**
 * @param {puppeteer.JSHandle<any>} listHandle
 * @returns {Promise<puppeteer.ElementHandle[]>}
 */
async function getHandlesFromListHandle(listHandle) {
    const properties = await listHandle.getProperties();
    const children = [];
    for (const property of properties.values()) {
        const element = property.asElement();
        if (element) {
            children.push(element);
        }
    }
    return children;
}


/**
 * @param {puppeteer.Page} page
 * @returns {Promise<puppeteer.ElementHandle[]>}
 */
async function findLoginLinksByCoords(page) {
    const listHandle = await page.evaluateHandle(loginRegexSrc => {
        const MAX_COORD_BASED_LINKS = 5;
        const MEDIAN_LOGIN_LINK_X = 1113;
        const MEDIAN_LOGIN_LINK_Y = 64.5;
        function distanceFromLoginLinkMedianPoint(elem) {
            const rect = elem.getBoundingClientRect();
            const centerX = (rect.x) + (rect.width/2);
            const centerY = (rect.y) + (rect.height/2);
            return Math.sqrt(Math.pow((centerX - MEDIAN_LOGIN_LINK_X), 2) +
                Math.pow((centerY - MEDIAN_LOGIN_LINK_Y), 2));
        }
        // @ts-ignore
        // eslint-disable-next-line no-undef
        const allElements = [...document.querySelectorAll('a,button')];
        allElements.sort((a, b) => distanceFromLoginLinkMedianPoint(a) - distanceFromLoginLinkMedianPoint(b));
        return allElements.slice(0, MAX_COORD_BASED_LINKS);
    });
    const elHandles = await getHandlesFromListHandle(listHandle);
    return elHandles;
}

/**
 * @param {string} typeOfEl
 */
function isButtonOrLink(typeOfEl) {
    const buttonOrLink = typeOfEl === 'BUTTON' || typeOfEl === 'A';
    return buttonOrLink ? 1 : 0;
}

/**
 * @param {puppeteer.Page} page
 * @returns {Promise<puppeteer.ElementHandle[]>}
 */
async function findLoginLinks(page, exactMatch=false) {
    const loginRegexSrc = exactMatch ? combinedLoginLinkRegexExactSrc : combinedLoginLinkRegexLooseSrc;
    const listHandle = await page.evaluateHandle(loginRegexSrc => {
        // @ts-ignore
        // eslint-disable-next-line no-undef
        const loginRegex = new RegExp(loginRegexSrc, 'i');
        const allElements = [...document.querySelectorAll('a,span,button,div')];

        let targetElements = allElements.filter(el => (
            (el.innerText && el.innerText.match(loginRegex) && (el.innerText === el.innerText.match(loginRegex)[0])) ||
            (el.title && el.title.match(loginRegex)) ||
            (el.ariaLabel && el.ariaLabel.match(loginRegex)) ||
            (el.href && (el.href instanceof SVGAnimatedString ? el.href.baseVal.match(loginRegex) : String(el.href).match(loginRegex)))||
            (el.placeholder && el.placeholder.match(loginRegex)) ||
            (el.id && el.id.match(loginRegex)) ||
            (el.name && el.name.match(loginRegex)) ||
            (el.className && (el.href instanceof SVGAnimatedString ? el.className.baseVal.match(loginRegex) : String(el.className).match(loginRegex)))
        ));
        return targetElements;
    }, loginRegexSrc);
    const elHandles = await getHandlesFromListHandle(listHandle);
    return elHandles;
}

/**
 * @param {puppeteer.Page} page
 * @returns {Promise<string[]>}
 */
async function findLoginLinkXPaths(page) {
    const loginLinkHandlesExact = await findLoginLinks(page, true);
    const loginLinkHandlesLoose = ENABLE_LOOSE_LOGIN_LINK_MATCHES ? await findLoginLinks(page, false) : [];
    const loginLinkXpaths = await Promise.all(loginLinkHandlesExact.concat(loginLinkHandlesLoose).map(getXPathFromHandle));
    return [...new Set(loginLinkXpaths)];  // take only distinct xpaths
}


/**
 * @param {puppeteer.Page} page
 * @param {function(...any):void} log
 * @returns {Promise<ElementAttributes[]>}
 */
async function getLoginLinkAttrs(page, log) {
    /** @type {ElementAttributes[]} */
    let linkAttrs = [];
    /** @type {string []} */
    let seenXpaths = [];
    let linkMatchTypes = ["exact", "loose"];
    if (ENABLE_COORD_BASED_LINK_SEARCH) {
        linkMatchTypes.push('coords');
    }
    for (const matchType of linkMatchTypes) {
        let loginLinkHandles;
        if (matchType === "coords") {
            loginLinkHandles = await findLoginLinksByCoords(page);
        } else {
            loginLinkHandles = await findLoginLinks(page, matchType==="exact");
        }
        const loginLinksAttrs = await Promise.all(loginLinkHandles.map(elementHandle => this.getElementAttrs(elementHandle, page.url(), true, log)));
        loginLinksAttrs.forEach(linkAttrs => linkAttrs.matchType = matchType);
        loginLinksAttrs.sort((a, b) => {
            if (isButtonOrLink(a.nodeType) > isButtonOrLink(b.nodeType)) {return -1;}
            if (isButtonOrLink(a.nodeType) < isButtonOrLink(b.nodeType)) {return 1;}
            if (a.onTop > b.onTop) {return -1;}
            if (a.onTop < b.onTop) {return 1;}
            if (a.inView > b.inView) {return -1;}
            if (a.inView < b.inView) {return 1;}
        });
        // if a link is an exact match, we see it returned twice: one for exact, one for loose
        if (matchType === "coords") {
            linkAttrs.push(...loginLinksAttrs.filter(elAttrs => !seenXpaths.includes(elAttrs.xpath)));
        } else{
            linkAttrs.push(...loginLinksAttrs.filter(elAttrs => !seenXpaths.includes(elAttrs.xpath)));
            seenXpaths = [...linkAttrs.map(el => el.xpath)];
        }
    }
    return linkAttrs;
}

/**
 * @param {string} xpath
 * @param {puppeteer.Page} page
 * @param {function(...any):void} log
 */
async function getElementAttrsByXPath(xpath, page, log) {
    const elementHandle = await this.getElementHandleFromXPath(page, xpath);
    let elAttributes = await this.getElementAttrs(elementHandle, page.url(), true, log);
    elAttributes.xpath = xpath;
    return elAttributes;
}

/**
 * @param {puppeteer.ElementHandle} elementHandle
 * @param {string} pageUrl
 * @param {boolean} getXPath
 * @param {function(...any):void} log
 * @returns {Promise<ElementAttributes>}
 */
async function getElementAttrs(elementHandle, pageUrl="", getXPath=false, log=null) {
    let boundingBox;
    let inViewPort;
    let elAttrs;
    if (!elementHandle) {return undefined;}
    try {
        boundingBox = await elementHandle.boundingBox();
        inViewPort = await elementHandle.isIntersectingViewport();
        // eslint-disable-next-line no-shadow
        elAttrs = await elementHandle.evaluate((el, getXPath) => ({
            id: el.id,
            type: el.getAttribute('type'),
            nodeType: el.nodeName,
            name: el.getAttribute('name'),
            href: el.href,
            class: el.className,
            innerText: el.innerText,
            ariaLabel: el.ariaLabel,
            placeholder: el.getAttribute('placeholder'),
            xpath: getXPath ? fathom && fathom.getXPath(el) : "",
            onTop: fathom && fathom.isOnTop(el),
        }), elementHandle, getXPath);
    } catch (error) {
        if (log) {log(`Error on ${pageUrl} while getting attributes: ${this.removeNewLineChar(error.message)}`);}
    }

    return Object.assign(elAttrs, {boundingBox}, {inView: inViewPort}, {elHandle: undefined}, {matchedType: undefined});
}

/**
 * @param {string} str
 */
function removeNewLineChar(str) {
    return str.replace(/[\n\r]+/g, ' ');
}

/**
 * @param {puppeteer.Page} page
 * @param {(arg0: string) => void} log
 * @param {string} cmpAction //Values can be 'NO_ACTION', 'ACCEPT_ALL', 'REJECT_ALL'
 */
async function findCMP(page, log=null, cmpAction = 'NO_ACTION') {
    let cmpDetected =false;
    await page.exposeFunction('foundCMPEvent', cmpName => {
        log(`CPM detected on ${page.url()}: ${cmpName}`);
        cmpDetected = true;
    });
    await page.evaluate(cmpAction => {
        let config = cmpConfigData;
        let consentTypes = GDPRConfig.defaultValues;
        let debugValues = GDPRConfig.defaultDebugFlags;
        if(cmpAction === 'NO_ACTION') {
            debugValues.skipActions = true;
        } else if(cmpAction === 'ACCEPT_ALL') {
            consentTypes = {
                A: true,
                B: true,
                D: true,
                E: true,
                F: true,
                X: true
            };
        }
        let engine = new ConsentEngine(config, consentTypes, debugValues, async stats => {
            await window.foundCMPEvent(JSON.stringify(stats));
        });
    }, cmpAction);
    //Sleep until CMP can be detected!
    //MAX_WAIT_TIME_FOR_CMP_DETECTION was calculated based on 1K crawl
    let waitTimeSum = 0;
    while(!cmpDetected && waitTimeSum < MAX_WAIT_TIME_FOR_CMP_DETECTION) {
        //log('Not detected CMP yet!');
        waitTimeSum += SLEEP_TIME_FOR_CMP_DETECTION;
        await sleep(SLEEP_TIME_FOR_CMP_DETECTION);
    }
    if(cmpDetected) {
        log(`Will wait ${POST_CMP_DETECTION_WAIT_TIME}ms after CMP detected!`);
        await page.waitForTimeout(POST_CMP_DETECTION_WAIT_TIME);
    }
}


module.exports = {
    sleep,
    getElementHandleFromXPath,
    getXPathFromHandle,
    getHandlesFromListHandle,
    removeNewLineChar,
    findLoginLinks,
    findLoginLinkXPaths,
    getLoginLinkAttrs,
    getElementAttrsByXPath,
    getElementAttrs,
    findCMP
};


/**
 * @typedef ElementAttributes
 * @property {String} id
 * @property {String} type
 * @property {String} nodeType
 * @property {String} name
 * @property {String} class
 * @property {String} innerText
 * @property {String} href
 * @property {String} ariaLabel
 * @property {String} placeholder
 * @property {boolean} inView - whether the element is in viewport or not
 * @property {String} xpath
 * @property {puppeteer.BoundingBox} boundingBox
 * @property {puppeteer.ElementHandle} elHandle
 * @property {Number} score
 * @property {String} matchType
 */