// Consent-O-Matic: https://github.com/cavi-au/Consent-O-Matic
// Browser-addon to detect and interact with cookie consent banners
class Action {
    static createAction(config, cmp) {
        switch(config.type) {
            case "click": return new ClickAction(config, cmp);
            case "list": return new ListAction(config, cmp);
            case "consent": return new ConsentAction(config, cmp);
            case "ifcss": return new IfCssAction(config, cmp);
            case "waitcss": return new WaitCssAction(config, cmp);
            case "foreach": return new ForEachAction(config, cmp);
            case "hide": return new HideAction(config, cmp);
            case "slide": return new SlideAction(config, cmp);
            case "close": return new CloseAction(config, cmp);
            case "wait": return new WaitAction(config, cmp);
            default: throw "Unknown action type: "+config.type;
        }
    }

    constructor(config) {
        this.config = config;
    }

    get timeout() {
        if(this.config.timeout != null) {
            return this.config.timeout;
        } else {
            if (ConsentEngine.debugValues.clickDelay) {
                return 250;
            } else {
                return 0;
            }
        }
    }

    async execute(param) {
        console.log("Remember to overrride execute()");
    }

    async waitTimeout(timeout) {
        return new Promise((resolve)=>{
            setTimeout(()=>{resolve();}, timeout);
        });
    }
}

class ListAction extends Action {
    constructor(config, cmp) {
        super(config);

        this.actions = [];
        config.actions.forEach((actionConfig)=>{
            this.actions.push(Action.createAction(actionConfig, cmp));
        });
    }

    async execute(param) {
        for(let action of this.actions) {
            await action.execute(param);
        }
    }
}

class CloseAction extends Action {
    constructor(config, cmp) {
        super(config);
    }

    async execute(param) {
        window.close();
    }
}

class WaitAction extends Action {
    constructor(config, cmp) {
        super(config);
    }

    async execute(param) {
        let self = this;
        await new Promise((resolve, reject)=>{
            setTimeout(()=>{ resolve() }, self.config.waitTime);
        });
    }
}

class ClickAction extends Action {
    constructor(config, cmp) {
        super(config);
        this.cmp = cmp;
    }

    async execute(param) {
        let result = Tools.find(this.config);

        if(result.target != null) {
            if(ConsentEngine.debugValues.clickDelay) {
                result.target.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "center"
                });
            }

            if(ConsentEngine.debugValues.debugClicks) {
                console.log("Clicking: [openInTab: "+this.config.openInTab+"]", result.target);
            }

            if(ConsentEngine.debugValues.clickDelay) {
                result.target.focus({preventScroll: true});
            }

            if(this.config.openInTab) {
                //Handle osx behaving differently?
                result.target.dispatchEvent(new MouseEvent("click", {ctrlKey: true, shiftKey: true}));
            } else {
                result.target.click();
            }
        }

        await this.waitTimeout(this.timeout);
    }
}

class ConsentAction extends Action {
    constructor(config, cmp) {
        super(config);

        let self = this;

        this.consents = [];

        this.config.consents.forEach((consentConfig)=>{
            self.consents.push(new Consent(consentConfig, cmp));
        });
    }

    async execute(consentTypes) {
        for(let consent of this.consents) {
            let shouldBeEnabled = false;
            
            if(consentTypes.hasOwnProperty(consent.type)) {
                shouldBeEnabled = consentTypes[consent.type];
            }

            await consent.setEnabled(shouldBeEnabled);
        }
    }
}

class IfCssAction extends Action {
    constructor(config, cmp) {
        super(config);

        if(config.trueAction != null) {
            this.trueAction = Action.createAction(config.trueAction, cmp);
        }

        if(config.falseAction != null) {
            this.falseAction = Action.createAction(config.falseAction, cmp);
        }
    }

    async execute(param) {
        let result = Tools.find(this.config);

        if(result.target != null) {
            if(this.trueAction != null) {
                await this.trueAction.execute(param);
            }
        } else {
            if(this.falseAction != null) {
                await this.falseAction.execute(param);
            }
        }
    }
}

class WaitCssAction extends Action {
    constructor(config, cmp) {
        super(config);
    }

    async execute(param) {
        let self = this;

        let negated = false;
        
        if(self.config.negated) {
            negated = self.config.negated;
        }

		if(ConsentEngine.debugValues.debugClicks) {
			console.time("Waiting ["+negated+"]:"+this.config.target.selector);
		}

        await new Promise((resolve)=>{
            let numRetries = 10;
            let waitTime = 250;

            if(self.config.retries) {
                numRetries = self.config.retries;
            }

            if(self.config.waitTime) {
                waitTime = self.config.waitTime;
            }

            function checkCss() {
                let result = Tools.find(self.config);

                if(negated) {
                    if(result.target != null) {
                        if(numRetries > 0) {
                            numRetries--;
                            setTimeout(checkCss, waitTime);
                        } else {
                            console.timeEnd("Waiting ["+negated+"]:"+self.config.target.selector);
                            resolve();
                        }
                    } else {
                        console.timeEnd("Waiting ["+negated+"]:"+self.config.target.selector);
                        resolve();
                    }
                } else {
                    if(result.target != null) {
                        console.timeEnd("Waiting ["+negated+"]:"+self.config.target.selector);
                        resolve();
                    } else {
                        if(numRetries > 0) {
                            numRetries--;
                            setTimeout(checkCss, waitTime);
                        } else {
                            console.timeEnd("Waiting ["+negated+"]:"+self.config.target.selector);
                            resolve();
                        }
                    }
                }
            }

            checkCss();
        });
    }
}

class ForEachAction extends Action {
    constructor(config, cmp) {
        super(config);

        this.action = Action.createAction(this.config.action, cmp);
    }

    async execute(param) {
        let results = Tools.find(this.config, true);

        let oldBase = Tools.base;

        for(let result of results) {
            if(result.target != null) {

                Tools.setBase(result.target);

                await this.action.execute(param);
            }
        }

        Tools.setBase(oldBase);
    }
}

class HideAction extends Action {
    constructor(config, cmp) {
        super(config);
        this.cmp = cmp;
    }

    async execute(param) {
        let self = this;
        let result = Tools.find(this.config);

        if(result.target != null) {
            this.cmp.hiddenTargets.push(result.target);
            result.target.classList.add("ConsentOMatic-CMP-Hider");
        }
    }
}

class SlideAction extends Action {
    constructor(config, cmp) {
        super(config);
    }

    async execute(param) {
        let result = Tools.find(this.config);

        let dragResult = Tools.find(this.config.dragTarget);

        if(result.target != null) {
            let targetBounds = result.target.getBoundingClientRect();
            let dragTargetBounds = dragResult.target.getBoundingClientRect();

            let yDiff = dragTargetBounds.top - targetBounds.top;
            let xDiff = dragTargetBounds.left - targetBounds.left;

            if(this.config.axis.toLowerCase() === "y") {
                xDiff = 0;
            }
            if(this.config.axis.toLowerCase() === "x") {
                yDiff = 0;
            }

            let screenX = window.screenX + targetBounds.left + targetBounds.width / 2.0;
            let screenY = window.screenY + targetBounds.top + targetBounds.height / 2.0;
            let clientX = targetBounds.left + targetBounds.width / 2.0;
            let clientY = targetBounds.top + targetBounds.height / 2.0;

            let mouseDown = document.createEvent("MouseEvents");
            mouseDown.initMouseEvent(
                "mousedown",
                true,
                true,
                window,
                0,
                screenX,
                screenY,
                clientX,
                clientY,
                false,
                false,
                false,
                false,
                0,
                result.target
            );

            let mouseMove = document.createEvent("MouseEvents");
            mouseMove.initMouseEvent(
                "mousemove",
                true,
                true,
                window,
                0,
                screenX+xDiff,
                screenY+yDiff,
                clientX+xDiff,
                clientY+yDiff,
                false,
                false,
                false,
                false,
                0,
                result.target
            );
            
            let mouseUp = document.createEvent("MouseEvents");
            mouseUp.initMouseEvent(
                "mouseup",
                true,
                true,
                window,
                0,
                screenX+xDiff,
                screenY+yDiff,
                clientX+xDiff,
                clientY+yDiff,
                false,
                false,
                false,
                false,
                0,
                result.target
            );

            result.target.dispatchEvent(mouseDown);
            await this.waitTimeout(10);
            result.target.dispatchEvent(mouseMove);
            await this.waitTimeout(10);
            result.target.dispatchEvent(mouseUp);
        }
    }
}

class CMP {
    constructor(name, config) {
        let self = this;

        this.name = name;

        this.detectors = [];
        config.detectors.forEach((detectorConfig)=>{
            self.detectors.push(new Detector(detectorConfig));
        });

        this.methods = new Map();
        config.methods.forEach((methodConfig)=>{
            if(methodConfig.action != null) {
                let action = Action.createAction(methodConfig.action, this);
                self.methods.set(methodConfig.name, action);
            }
        });

        this.hiddenTargets = [];
    }

    unHideAll() {
        this.hiddenTargets.forEach((target)=>{
            target.classList.remove("ConsentOMatic-CMP-Hider");
        });
    }

    detect() {
        let detector = this.detectors.find((detector)=>{
            return detector.detect();
        });

        if(detector != null && ConsentEngine.debugValues.debugLog) {
            console.log("Triggered detector: ", detector);
        }

        return detector != null;
    }

    isShowing() {
        let detector = this.detectors.find((detector)=>{
            return detector.detect();
        });

        return detector.isShowing();
    }

    async runMethod(name, param = null) {
        let action = this.methods.get(name);

        if(action != null) {
            if(ConsentEngine.debugValues.debugLog) {
                console.log("Triggering method: ", name);
            }
            await action.execute(param);
        } else {
            //Make no method behave as if an action was called, IE. push os back on the task stack
            await new Promise((resolve)=>{
                setTimeout(()=>{
                    resolve();
                }, 0);
            });
        }
    }
}

class Consent {
    constructor(config, cmp) {
        this.config = config;
        this.cmp = cmp;

        if(this.config.toggleAction != null) {
            this.toggleAction = Action.createAction(this.config.toggleAction, cmp);
        }

        if(this.config.matcher != null) {
            this.enabledMatcher = Matcher.createMatcher(this.config.matcher);
        }

        if(this.config.falseAction != null) {
            this.falseAction = Action.createAction(this.config.falseAction, cmp);
        }

        if(this.config.trueAction != null) {
            this.trueAction = Action.createAction(this.config.trueAction, cmp);
        }
    }

    async toggle() {
        return await this.toggleAction.execute();
    }

    isEnabled() {
        return this.enabledMatcher.matches();
    }

    async setEnabled(enabled) {
        if(this.enabledMatcher != null && this.toggleAction != null) {
            if(this.isEnabled() && !enabled) {
                await this.toggle();
            } else if(!this.isEnabled() && enabled) {
                await this.toggle();
            }
        } else {
            if(enabled) {
                await this.trueAction.execute();
            } else {
                await this.falseAction.execute();
            }
        }

        if (ConsentEngine.debugValues.paintMatchers) {
            if(this.enabledMatcher != null) {
                //Debug if state is correct
                await this.enabledMatcher.debug(enabled);
            }
        }
    }

    get type() {
        return this.config.type;
    }
}

class ConsentEngine {
    constructor(config, consentTypes, debugValues, handledCallback) {
        let self = this;

        ConsentEngine.debugValues = debugValues;

        this.consentTypes = consentTypes;

        this.cmps = [];

        this.handledCallback = handledCallback;

        this.triedCMPs = new Set();

        Object.keys(config).forEach((key) => {
            try {
                self.cmps.push(new CMP(key, config[key]));
            } catch (err) {
                console.groupCollapsed("Invalid CMP (" + key + ") detected, please update GDPR consent engine or fix the rule generating this error:");
                console.error(err);
                console.groupEnd();
            }
        });

        this.setupObserver();
        this.startObserver();

        this.handleMutations([]);
    }

    async handleMutations(mutations) {
        let self = this;

        let cmps = this.findCMP();

        cmps = cmps.filter((cmp)=>{
            return !self.triedCMPs.has(cmp.name);
        });

        if (cmps.length > 0) {
            this.stopObserver();

            if (cmps.length > 1) {
                console.warn("Found multiple CMPS's maybee rewise detection rules...", cmps);
            }

            let cmp = cmps[0];

            if(ConsentEngine.debugValues.debugLog) {
                console.log("CMP Detected: ", cmp.name);
            }

            this.triedCMPs.add(cmp.name);

            //Check if popup shows, then do consent stuff
            let numberOfTries = 10;
            async function checkIsShowing() {
                if (cmp.isShowing()) {
                    setTimeout(async () => {
                        try {
                          if(!ConsentEngine.debugValues.skipActions) {
                            self.showProgressDialog("Autofilling "+cmp.name+", please wait...");

                            if (!ConsentEngine.debugValues.skipHideMethod) {
                                await cmp.runMethod("HIDE_CMP");
                            }
                            await cmp.runMethod("OPEN_OPTIONS");
                            if (!ConsentEngine.debugValues.skipHideMethod) {
                                await cmp.runMethod("HIDE_CMP");
                            }
                            await cmp.runMethod("DO_CONSENT", self.consentTypes);
                            if (!ConsentEngine.debugValues.skipSubmit) {
                                await cmp.runMethod("SAVE_CONSENT");
                            }
                          }
                            self.handledCallback({
                                cmpName: cmp.name
                            });
                        } catch(e) {
                            console.log("Error during consent handling:", e);
                        }
                        if(!ConsentEngine.debugValues.skipActions){
                          cmp.unHideAll();
                          self.hideProgressDialog();
                        }
                    }, 0);
                } else {
                    if (numberOfTries > 0) {
                        numberOfTries--;
                        setTimeout(checkIsShowing, 250);
                    } else {
                        if(ConsentEngine.debugValues.debugLog) {
                            console.log("Not showing...", cmp.name);
                        }
                        self.startObserver();
                        self.handleMutations([]);
                    }
                }
            }

            checkIsShowing();
        }
    }

    showProgressDialog(text) {
        if(ConsentEngine.debugValues.debugLog) {
            console.log("Showing progress...");
        }
        this.modal = document.createElement("div");
        this.modal.classList.add("ConsentOMatic-Progress-Dialog-Modal");
        this.dialog = document.createElement("div");
        this.dialog.classList.add("ConsentOMatic-Progress-Dialog");
        let header = document.createElement("h1");
        let contents = document.createElement("p");
        header.innerText = "Consent-o-Matic";
        contents.innerText = text;
        this.dialog.appendChild(header);
        this.dialog.appendChild(contents);
        document.body.appendChild(this.dialog);
        document.body.appendChild(this.modal);
        setTimeout(()=>{
            this.dialog.classList.add("ConsentOMatic-Progress-Started");
        }, 0);
    }

    hideProgressDialog() {
        let self = this;
        if(ConsentEngine.debugValues.debugLog) {
            console.log("Hiding progress...");
        }
        this.dialog.classList.add("ConsentOMatic-Progress-Complete");
        setTimeout(()=>{
            self.modal.remove();
            self.dialog.remove();
            self.dialog = null;
        },1000);
    }

    setupObserver() {
        let self = this;

        this.observer = new MutationObserver((mutations) => {
            this.handleMutations(mutations);
        });
    }

    startObserver() {
        this.observer.observe(document.body, {
            childList: true,
            attributes: true,
            subtree: true
        });
    }

    stopObserver() {
        this.observer.disconnect();
    }

    findCMP() {
        return this.cmps.filter((cmp) => {
            return cmp.detect();
        });
    }
}


class Detector {
    constructor(config) {
        this.config = config;

        this.presentMatcher = Matcher.createMatcher(this.config.presentMatcher);
        this.showingMatcher = Matcher.createMatcher(this.config.showingMatcher);
    }

    detect() {
        return this.presentMatcher.matches();
    }

    isShowing() {
        return this.showingMatcher.matches();
    }
}

class GDPRConfig {
    static getLogEntries() {
        return new Promise((resolve, reject)=>{
            chrome.storage.local.get({
                logEntries: []
            }, (result)=>{
                resolve(result.logEntries);
            });
        });
    }

    static setLogEntries(logEntries) {
        return new Promise((resolve, reject)=>{
            chrome.storage.local.set({
                logEntries: logEntries
            }, ()=>{
                resolve();
            });
        });
    }

    static getConsentValues() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get({
                consentValues: GDPRConfig.defaultValues
            }, (result) => {
                resolve(result.consentValues);
            });
        });
    }
    
    static getDebugValues() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get({
                debugFlags: GDPRConfig.defaultDebugFlags
            }, (result) => {
                resolve(result.debugFlags);
            });
        });
    }    

    static getCustomRuleLists() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get({
                customRuleLists: {}
            }, (result) => {
                resolve(result.customRuleLists);
            });
        });
    }

    static setCustomRuleLists(lists) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                customRuleLists: lists
            }, () => {
                resolve();
            });
        });
    }

    static getRuleLists() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get({
                ruleLists: GDPRConfig.defaultRuleLists
            }, (result) => {
                resolve(result.ruleLists);
            });
        });
    }

    static setRuleLists(lists) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.set({
                ruleLists: lists
            }, () => {
                resolve();
            });
        });
    }

    static removeRuleList(list) {
        return new Promise((resolve, reject) => {
            GDPRConfig.getRuleLists().then((ruleLists) => {
                GDPRConfig.setRuleLists(ruleLists.filter((ruleList) => {
                    return ruleList !== list;
                })).then(() => {
                    resolve();
                });
            });
        });
    }

    static addRuleList(list) {
        return new Promise((resolve, reject) => {
            GDPRConfig.getRuleLists().then((ruleLists) => {
                ruleLists.push(list);
                GDPRConfig.setRuleLists(ruleLists).then(() => {
                    resolve();
                });
            });
        });
    }

    static isActive(url) {
        return new Promise((resolve, reject)=>{
            chrome.storage.sync.get({
                disabledPages: {}
            }, ({disabledPages: disabledPages}) => {
                resolve(disabledPages[url] == null);
            });
        });
    }

    static setPageActive(url, active) {
        return new Promise((resolve, reject)=>{
            chrome.storage.sync.get({
                disabledPages: {}
            }, ({disabledPages: disabledPages}) => {
                if(active) {
                    delete disabledPages[url];
                } else {
                    disabledPages[url] = true;
                }
                chrome.storage.sync.set({
                    disabledPages: disabledPages
                }, ()=>{
                    resolve();
                });
            });
        });
    }
    
    static async getDebugFlags() {
        let debugValues = await GDPRConfig.getDebugValues();

        return [
            {
                "name": "clickDelay",
                "description": "Wait a short time between performing each action or mouse gesture",
                "value": debugValues.clickDelay
            },
            {
                "name": "skipSubmit",
                "description": "Perform actions normally but avoid submitting the form when done",
                "value": debugValues.skipSubmit
            },
            {
              "name": "skipActions",
              "description": "Detect CMP normally but avoid all actions",
              "value": debugValues.skipActions
            },
            {
                "name": "paintMatchers",
                "description": "Visual feedback while matching items in the form",
                "value": debugValues.paintMatchers
            },
            {
                "name": "debugClicks",
                "description": "Debug clicks to the log",
                "value": debugValues.debugClicks
            },
            {
                "name": "alwaysForceRulesUpdate",
                "description": "Always force a reload of the rules on each load",
                "value": debugValues.alwaysForceRulesUpdate
            },
            {
                "name": "skipHideMethod",
                "description": "Skips the HIDE_CMP method, to better see whats going on behind the scenes.",
                "value": debugValues.skipHideMethod
            },
            {
                "name": "debugLog",
                "description": "Enables extra logging",
                "value": debugValues.debugLog
            }
        ];
    }

    static async getConsentTypes() {
        let consentValues = await GDPRConfig.getConsentValues();

        return [
            {
                "name": "Information Storage and Access",
                "description": "Storage of information or access to information that is already stored on your device - such as advertising identifiers, device identifiers, cookies, and similar technologies.",
                "type": "D",
                "value": consentValues.D
            },
            {
                "name": "Preferences and Functionality",
                "description": "Allow sites to remember choices you make (such as your user name, language or the region you are located in) and provide enhanced, more personal features. For instance, these cookies can be used to remember your login details, changes you have made to text size, fonts and other parts of web pages that you can customize. They may also be used to provide services you have asked for such as watching a video or commenting on a blog. The information in these cookies is not used to track your browsing activity on other websites.",
                "type": "A",
                "value": consentValues.A
            },
            {
                "name": "Performance and Analytics",
                "description": "The collection of information, and combination with previously collected information, to measure, understand, and report, on your usage of the services. This allows websites to count visits and traffic sources so they can measure and improve the performance of the site. It helps them know which pages are the most and least popular, see how visitors move around the site, and where visitors come from.",
                "type": "B",
                "value": consentValues.B
            },
            {
                "name": "Content selection, delivery, and reporting",
                "description": "Collection of information, and combination with previously collected information, to select and deliver <b>content</b> for you, and to measure the delivery and effectiveness of such content. This includes using previously collected information about your interests to select content, processing data about what content was shown, how often or how long it was shown, when and where it was shown, and whether you took any action related to the content, including for example clicking on content. The data will be used to personalise content on the website itself, but also in other contexts such as other websites, apps, browsers, and devices.",
                "type": "E",
                "value": consentValues.E
            },
            {
                "name": "Ad selection, delivery, and reporting",
                "description": "Collection of information, and combination with previously collected information, to select and deliver <b>advertisements</b>, and to measure the delivery and effectiveness of such advertisements. This includes using previously collected information about your interests to select ads, processing data about what advertisements were shown, how often they were shown, when and where they were shown, and whether you took any action related to the advertisement, including for example clicking an ad or making a purchase. The data will be used to personalise advertising on the website itself, but also in other contexts such as other websites, apps, browsers, and devices.<br><br>Also includes:<br>Google",
                "type": "F",
                "value": consentValues.F
            },
            {
                "name": "Other Purposes",
                "description": "Unclassified data collection for which the purpose is not clearly described by the website or where the data collection and processing does not fit any other category",
                "type": "X",
                "value": consentValues.X
            }
        ];
    }

    static setConsentValues(consentValues) {
        return new Promise((resolve, reject)=>{
            consentValues = Object.assign({}, GDPRConfig.defaultValues, consentValues);

            chrome.storage.sync.set({
                consentValues: consentValues
            }, () => {
                resolve();
            });
        });
    }
    
    static setDebugFlags(newDebugFlags) {
        return new Promise((resolve, reject)=>{
            newDebugFlags = Object.assign({}, GDPRConfig.defaultDebugFlags, newDebugFlags);

            chrome.storage.sync.set({
                debugFlags: newDebugFlags
            }, () => {
                resolve();
            });
        });
    }    

    static clearRuleCache() {
        return new Promise((resolve, reject)=>{
            chrome.storage.local.set({
                cachedEntries: {}
            }, ()=>{
                resolve();
            });
        });
    }
}

GDPRConfig.defaultValues = {
    "A": false,
    "B": false,
    "D": false,
    "E": false,
    "F": false,
    "X": false
};

GDPRConfig.defaultRuleLists = [
    "https://raw.githubusercontent.com/cavi-au/Consent-O-Matic/master/Rules.json",
];


GDPRConfig.defaultDebugFlags = {
    "clickDelay": false,
    "skipSubmit": false,
    "skipActions": false,
    "paintMatchers": false,
    "debugClicks": false,
    "alwaysForceRulesUpdate": false,
    "skipHideMethod": false,
    "debugLog": false
}
class Matcher {
    static createMatcher(config) {
        switch(config.type) {
            case "css": return new CssMatcher(config);
            case "checkbox": return new CheckboxMatcher(config);
            default: throw "Unknown matcher type: "+config.type;
        }
    }

    constructor(config) {
        this.config = config;
    }

    matches() {
        console.log("Remember to override matches()");
    }

    async debug(shouldMatch) {
        let result = Tools.find(this.config);

        let blinker = result.parent || result.target;

        if(blinker != null) {
            if(blinker.matches("input")) {
                blinker = blinker.parentNode;
            }

            let matches = this.matches();
            let correct = shouldMatch === matches;

            if (ConsentEngine.debugValues.clickDelay) {
                blinker.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "center"
                });
            }

            if(correct) {
                blinker.style.border = "2px solid lime";
                blinker.style.backgroundColor = "lime";
            } else {
                blinker.style.border = "2px solid pink";
                blinker.style.backgroundColor = "pink";
            }

            await new Promise((resolve, reject)=>{
                if (ConsentEngine.debugValues.clickDelay) {
                        setTimeout(()=>{
                        resolve();
                    }, 10);
                } else {
                    resolve();
                }
            });
        }
    }
}

class CssMatcher extends Matcher {
    constructor(config) {
        super(config);
    }

    matches() {
        let result = Tools.find(this.config);

        return result.target != null;
    }
}

class CheckboxMatcher extends Matcher {
    constructor(config) {
        super(config);
    }

    matches() {
        let result = Tools.find(this.config);
        
        return result.target != null && result.target.checked;
    }
}

class Tools {
    static setBase(base) {
        Tools.base = base;
    }

    static findElement(options, parent = null, multiple = false) {
        let possibleTargets = null;

        if (parent != null) {
            possibleTargets = Array.from(parent.querySelectorAll(options.selector));
        } else {
            if (Tools.base != null) {
                possibleTargets = Array.from(Tools.base.querySelectorAll(options.selector));
            } else {
                possibleTargets = Array.from(document.querySelectorAll(options.selector));
            }
        }

        if (options.textFilter != null) {
            possibleTargets = possibleTargets.filter((possibleTarget) => {
                let textContent = possibleTarget.textContent.toLowerCase();

                if (Array.isArray(options.textFilter)) {
                    let foundText = false;

                    for (let text of options.textFilter) {
                        if (textContent.indexOf(text.toLowerCase()) !== -1) {
                            foundText = true;
                            break;
                        }
                    }

                    return foundText;
                } else if (options.textFilter != null) {
                    return textContent.indexOf(options.textFilter.toLowerCase()) !== -1;
                }
            });
        }

        if (options.styleFilters != null) {
            possibleTargets = possibleTargets.filter((possibleTarget) => {
                let styles = window.getComputedStyle(possibleTarget);

                let keep = true;

                for (let styleFilter of options.styleFilters) {
                    let option = styles[styleFilter.option]

                    if (styleFilter.negated) {
                        keep = keep && (option !== styleFilter.value);
                    } else {
                        keep = keep && (option === styleFilter.value);
                    }
                }

                return keep;
            });
        }

        if (options.displayFilter != null) {
            possibleTargets = possibleTargets.filter((possibleTarget) => {
                if(options.displayFilter) {
                    //We should be displayed
                    return possibleTarget.offsetHeight !== 0;
                } else {
                    //We should not be displayed
                    return possibleTarget.offsetHeight === 0;
                }
            });
        }

        if (options.iframeFilter != null) {
            possibleTargets = possibleTargets.filter((possibleTarget) => {
                if(options.iframeFilter) {
                    //We should be inside an iframe
                    return window.location !== window.parent.location;
                } else {
                    //We should not be inside an iframe
                    return window.location === window.parent.location;
                }
            });
        }

        if(options.childFilter != null) {
            possibleTargets = possibleTargets.filter((possibleTarget) => {
                let oldBase = Tools.base;
                Tools.setBase(possibleTarget);
                let childResults = Tools.find(options.childFilter);
                Tools.setBase(oldBase);
                return childResults.target != null;
            });
        }

        if (multiple) {
            return possibleTargets;
        } else {
            if (possibleTargets.length > 1) {
                if(ConsentEngine.debugValues.debugLog) {
                    console.warn("Multiple possible targets: ", possibleTargets, options, parent);
                }
            }

            return possibleTargets[0];
        }
    }

    static find(options, multiple = false) {
        let results = [];
        if (options.parent != null) {
            let parent = Tools.findElement(options.parent, null, multiple);
            if (parent != null) {
                if (parent instanceof Array) {
                    parent.forEach((p) => {
                        let targets = Tools.findElement(options.target, p, multiple);
                        if (targets instanceof Array) {
                            targets.forEach((target) => {
                                results.push({
                                    "parent": p,
                                    "target": target
                                });
                            });
                        } else {
                            results.push({
                                "parent": p,
                                "target": targets
                            });
                        }
                    });

                    return results;
                } else {
                    let targets = Tools.findElement(options.target, parent, multiple);
                    if (targets instanceof Array) {
                        targets.forEach((target) => {
                            results.push({
                                "parent": parent,
                                "target": target
                            });
                        });
                    } else {
                        results.push({
                            "parent": parent,
                            "target": targets
                        });
                    }
                }
            }
        } else {
            let targets = Tools.findElement(options.target, null, multiple);
            if (targets instanceof Array) {
                targets.forEach((target) => {
                    results.push({
                        "parent": null,
                        "target": target
                    });
                });
            } else {
                results.push({
                    "parent": null,
                    "target": targets
                });
            }
        }

        if (results.length === 0) {
            results.push({
                "parent": null,
                "target": null
            });
        }

        if (multiple) {
            return results;
        } else {
            if (results.length !== 1) {
                console.warn("Multiple results found, even though multiple false", results);
            }

            return results[0];
        }
    }
}

Tools.base = null;

cmpConfigData = {
    "Autodesk": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#adsk-eprivacy-body"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "displayFilter": true,
              "selector": "#adsk-eprivacy-body"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": "#adsk-eprivacy-body"
            },
            "type": "hide"
          },
          "name": "HIDE_CMP"
        },
        {
          "action": {
            "target": {
              "selector": "#adsk-eprivacy-privacy-details"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "action": {
              "actions": [
                {
                  "target": {
                    "selector": "h4",
                    "textFilter": [
                      "Online experience"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[data-category-selector='no']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[data-category-selector='yes']"
                          },
                          "type": "click"
                        },
                        "type": "E"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "h4",
                    "textFilter": [
                      "Communication"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[data-category-selector='no']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[data-category-selector='yes']"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "h4",
                    "textFilter": [
                      "Customer feedback"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[data-category-selector='no']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[data-category-selector='yes']"
                          },
                          "type": "click"
                        },
                        "type": "X"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "h4",
                    "textFilter": [
                      "Digital advertising"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[data-category-selector='no']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[data-category-selector='yes']"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "h4",
                    "textFilter": [
                      "Troubleshooting"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[data-category-selector='no']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[data-category-selector='yes']"
                          },
                          "type": "click"
                        },
                        "type": "X"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                }
              ],
              "type": "list"
            },
            "target": {
              "selector": "#adsk-eprivacy-form .adsk-eprivacy-category-container"
            },
            "type": "foreach"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": "#adsk-eprivacy-continue-btn"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "EvidonBanner": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#_evidon_banner"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "displayFilter": true,
              "selector": "#_evidon_banner"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "#_evidon_banner #_evidon-message a",
                  "textFilter": [
                    "choices",
                    "Cookie Consent Tool",
                    "here"
                  ]
                },
                "type": "click"
              },
              {
                "type": "wait",
                "waitTime": 250
              },
              {
                "target": {
                  "selector": "#_evidon_banner #_evidon-option-button"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "falseAction": {
                  "actions": [
                    {
                      "negated": false,
                      "retries": 10,
                      "target": {
                        "selector": "iframe#_evidon-consent-frame"
                      },
                      "type": "waitcss",
                      "waitTime": 250
                    },
                    {
                      "negated": true,
                      "retries": 10,
                      "target": {
                        "selector": "iframe#_evidon-consent-frame"
                      },
                      "type": "waitcss",
                      "waitTime": 250
                    },
                    {
                      "target": {
                        "selector": "button#_evidon-accept-button"
                      },
                      "type": "click"
                    }
                  ],
                  "type": "list"
                },
                "target": {
                  "selector": "#evidon-prefdiag-overlay"
                },
                "trueAction": {
                  "target": {
                    "selector": ".evidon-prefdiag-declinebtn"
                  },
                  "type": "click"
                },
                "type": "ifcss"
              }
            ],
            "type": "list"
          },
          "name": "SAVE_CONSENT"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "#evidon-prefdiag-background"
                },
                "type": "hide"
              },
              {
                "target": {
                  "selector": "#evidon-prefdiag-overlay"
                },
                "type": "hide"
              },
              {
                "target": {
                  "selector": "#_evidon_banner"
                },
                "type": "hide"
              }
            ],
            "type": "list"
          },
          "name": "HIDE_CMP"
        },
        {
          "action": {
            "target": {
              "selector": "#evidon-prefdiag-overlay"
            },
            "trueAction": {
              "actions": [
                {
                  "target": {
                    "selector": ".evidon-prefdiag-sidebarlink",
                    "textFilter": [
                      "Purposes"
                    ]
                  },
                  "type": "click"
                },
                {
                  "action": {
                    "actions": [
                      {
                        "target": {
                          "selector": "[id*=iab-purpose-name]",
                          "textFilter": [
                            "Information storage and access"
                          ]
                        },
                        "trueAction": {
                          "consents": [
                            {
                              "matcher": {
                                "target": {
                                  "selector": "input"
                                },
                                "type": "checkbox"
                              },
                              "toggleAction": {
                                "target": {
                                  "selector": "label"
                                },
                                "type": "click"
                              },
                              "type": "D"
                            }
                          ],
                          "type": "consent"
                        },
                        "type": "ifcss"
                      },
                      {
                        "target": {
                          "selector": "[id*=iab-purpose-name]",
                          "textFilter": [
                            "Personalisation"
                          ]
                        },
                        "trueAction": {
                          "consents": [
                            {
                              "matcher": {
                                "target": {
                                  "selector": "input"
                                },
                                "type": "checkbox"
                              },
                              "toggleAction": {
                                "target": {
                                  "selector": "label"
                                },
                                "type": "click"
                              },
                              "type": "F"
                            }
                          ],
                          "type": "consent"
                        },
                        "type": "ifcss"
                      },
                      {
                        "target": {
                          "selector": "[id*=iab-purpose-name]",
                          "textFilter": [
                            "Content selection, delivery, reporting"
                          ]
                        },
                        "trueAction": {
                          "consents": [
                            {
                              "matcher": {
                                "target": {
                                  "selector": "input"
                                },
                                "type": "checkbox"
                              },
                              "toggleAction": {
                                "target": {
                                  "selector": "label"
                                },
                                "type": "click"
                              },
                              "type": "E"
                            }
                          ],
                          "type": "consent"
                        },
                        "type": "ifcss"
                      },
                      {
                        "target": {
                          "selector": "[id*=iab-purpose-name]",
                          "textFilter": [
                            "Ad selection, delivery, reporting"
                          ]
                        },
                        "trueAction": {
                          "consents": [
                            {
                              "matcher": {
                                "target": {
                                  "selector": "input"
                                },
                                "type": "checkbox"
                              },
                              "toggleAction": {
                                "target": {
                                  "selector": "label"
                                },
                                "type": "click"
                              },
                              "type": "F"
                            }
                          ],
                          "type": "consent"
                        },
                        "type": "ifcss"
                      },
                      {
                        "target": {
                          "selector": "[id*=iab-purpose-name]",
                          "textFilter": [
                            "Measurement"
                          ]
                        },
                        "trueAction": {
                          "consents": [
                            {
                              "matcher": {
                                "target": {
                                  "selector": "input"
                                },
                                "type": "checkbox"
                              },
                              "toggleAction": {
                                "target": {
                                  "selector": "label"
                                },
                                "type": "click"
                              },
                              "type": "B"
                            }
                          ],
                          "type": "consent"
                        },
                        "type": "ifcss"
                      }
                    ],
                    "type": "list"
                  },
                  "target": {
                    "selector": "#iab-purpose-container [id*='iab-purpose']"
                  },
                  "type": "foreach"
                },
                {
                  "target": {
                    "selector": ".evidon-prefdiag-acceptbtn",
                    "textFilter": [
                      "Save Preferences"
                    ]
                  },
                  "type": "click"
                },
                {
                  "target": {
                    "selector": ".evidon-prefdiag-sidebarlink",
                    "textFilter": [
                      "Vendors"
                    ]
                  },
                  "type": "click"
                }
              ],
              "type": "list"
            },
            "type": "ifcss"
          },
          "name": "DO_CONSENT"
        }
      ]
    },
    "EvidonIFrame": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": ".footer .evidon-footer-image"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "selector": ".footer .evidon-footer-image"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Advertising"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Advertising"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Functional"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Functional"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "A"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Analytics Provider"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Analytics Provider"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Social Media"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Social Media"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Ad Network"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Ad Network"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Ad Server"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Ad Server"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Creative/Ad Format Technology"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Research Provider"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Research Provider"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Creative/Ad Format Technology"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Data Aggregator/Supplier"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Data Aggregator/Supplier"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Publisher"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Publisher"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Demand Side Platform"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Demand Side Platform"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Retargeter"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Retargeter"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Ad Exchange"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Ad Exchange"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Marketing Solutions"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Marketing Solutions"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Advertiser"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Advertiser"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Supply Side Platform"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Supply Side Platform"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Optimizer"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Optimizer"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Ad Verification"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Ad Verification"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Data Management Platform"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Data Management Platform"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Agency"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Agency"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Business Intelligence"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Business Intelligence"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Key Ad Personalization Cookies"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Key Ad Personalization Cookies"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Analytics"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header-text",
                            "textFilter": "Analytics"
                          }
                        },
                        "selector": ".category-header"
                      },
                      "target": {
                        "selector": "img.category-check.checked"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "button#apply-button"
                },
                "type": "click"
              },
              {
                "target": {
                  "selector": "#optoutfeedback",
                  "textFilter": [
                    "opted out",
                    "settings updated"
                  ]
                },
                "type": "waitcss"
              },
              {
                "type": "close"
              }
            ],
            "type": "list"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "consentmanager.net": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": "#cmpbox"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "selector": "#cmpbox .cmpmore"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "#cmpbox .cmpmorelink",
                  "textFilter": [
                    "Customize your choice",
                    "More Options"
                  ]
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "action": {
                  "actions": [
                    {
                      "target": {
                        "selector": ".cmpvendname",
                        "textFilter": "Information storage and access"
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "parent": {
                                "selector": ".cmptdchoice"
                              },
                              "target": {
                                "selector": ".cmponofftext",
                                "textFilter": "on"
                              },
                              "type": "css"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": ".cmpimgyesno"
                              },
                              "type": "click"
                            },
                            "type": "D"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    },
                    {
                      "target": {
                        "selector": ".cmpvendname",
                        "textFilter": "Personalisation"
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "parent": {
                                "selector": ".cmptdchoice"
                              },
                              "target": {
                                "selector": ".cmponofftext",
                                "textFilter": "on"
                              },
                              "type": "css"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": ".cmpimgyesno"
                              },
                              "type": "click"
                            },
                            "type": "F"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    },
                    {
                      "target": {
                        "selector": ".cmpvendname",
                        "textFilter": "Ad selection, delivery, reporting"
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "parent": {
                                "selector": ".cmptdchoice"
                              },
                              "target": {
                                "selector": ".cmponofftext",
                                "textFilter": "on"
                              },
                              "type": "css"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": ".cmpimgyesno"
                              },
                              "type": "click"
                            },
                            "type": "F"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    },
                    {
                      "target": {
                        "selector": ".cmpvendname",
                        "textFilter": "Content selection, delivery, reporting"
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "parent": {
                                "selector": ".cmptdchoice"
                              },
                              "target": {
                                "selector": ".cmponofftext",
                                "textFilter": "on"
                              },
                              "type": "css"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": ".cmpimgyesno"
                              },
                              "type": "click"
                            },
                            "type": "E"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    },
                    {
                      "target": {
                        "selector": ".cmpvendname",
                        "textFilter": "Measurement"
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "parent": {
                                "selector": ".cmptdchoice"
                              },
                              "target": {
                                "selector": ".cmponofftext",
                                "textFilter": "on"
                              },
                              "type": "css"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": ".cmpimgyesno"
                              },
                              "type": "click"
                            },
                            "type": "B"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    }
                  ],
                  "type": "list"
                },
                "parent": null,
                "target": {
                  "selector": "#cmpbox .cmptbl tbody tr:not(.cmpvenditem)"
                },
                "type": "foreach"
              },
              {
                "action": {
                  "consents": [
                    {
                      "matcher": {
                        "parent": {
                          "selector": ".cmptdchoice"
                        },
                        "target": {
                          "selector": ".cmponofftext",
                          "textFilter": "on"
                        },
                        "type": "css"
                      },
                      "toggleAction": {
                        "target": {
                          "selector": ".cmpimgyesno"
                        },
                        "type": "click"
                      },
                      "type": "X"
                    }
                  ],
                  "type": "consent"
                },
                "parent": null,
                "target": {
                  "selector": "#cmpbox .cmptbl tbody tr.cmpvenditem"
                },
                "type": "foreach"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "#cmpbox .cmpboxbtn.cmpboxbtnyes"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "cookieLab": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#cookieLab"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": "#cookieLab"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": "#cookieLab #consentChooseCookies"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "action": {
              "actions": [
                {
                  "target": {
                    "selector": ".cookieInfo",
                    "textFilter": [
                      "Statistical analysis cookies"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": ".cookieInfo"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": ".cookieInfo"
                          },
                          "type": "click"
                        },
                        "type": "B"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": ".cookieInfo",
                    "textFilter": [
                      "Advertising cookies"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": ".cookieInfo"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": ".cookieInfo"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                }
              ],
              "type": "list"
            },
            "target": {
              "selector": "#cookieLab #cookieChooseCookies > label"
            },
            "type": "foreach"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": "#cookieLab #chooseSaveSettings"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "cookiebar": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#cookie-law-info-bar"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "displayFilter": true,
              "selector": "#cookie-law-info-bar"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": ".wt-cli-cookie-bar-container .cli_settings_button"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".wt-cli-cookie-bar-container .cli-tab-header",
                        "textFilter": [
                          "Functional"
                        ]
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".wt-cli-cookie-bar-container .cli-tab-header",
                        "textFilter": [
                          "Functional"
                        ]
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "A"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".wt-cli-cookie-bar-container .cli-tab-header",
                        "textFilter": [
                          "Performance"
                        ]
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".wt-cli-cookie-bar-container .cli-tab-header",
                        "textFilter": [
                          "Performance"
                        ]
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".wt-cli-cookie-bar-container .cli-tab-header",
                        "textFilter": [
                          "Marketing"
                        ]
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".wt-cli-cookie-bar-container .cli-tab-header",
                        "textFilter": [
                          "Marketing"
                        ]
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".wt-cli-cookie-bar-container .cli-tab-header",
                        "textFilter": [
                          "Tracking"
                        ]
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".wt-cli-cookie-bar-container .cli-tab-header",
                        "textFilter": [
                          "Tracking"
                        ]
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": ".wt-cli-cookie-bar-container .cli_setting_save_button"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        },
        {
          "action": null,
          "name": "HIDE_CMP"
        }
      ]
    },
    "cookiebot": {
      "detectors": [
        {
          "presentMatcher": {
            "type": "css",
            "target": {
              "selector": "#CybotCookiebotDialogBodyLevelButtonPreferences"
            }
          },
          "showingMatcher": {
            "type": "css",
            "target": {
              "selector": "#CybotCookiebotDialogBodyButtonAccept, #CybotCookiebotDialogBody",
              "displayFilter": true
            }
          }
        }
      ],
      "methods": [
        {
          "action": {
            "type": "list",
            "actions": [
              {
                "type": "click",
                "target": {
                  "selector": "#CybotCookiebotDialogBodyButtonDetails",
                  "displayFilter": true
                }
              },
              {
                "type": "click",
                "target": {
                  "selector": ".cb-button",
                  "textFilter": "Manage cookies",
                  "displayFilter": true
                }
              },
              {
                "type": "click",
                "target": {
                  "selector": ".js-cookie-settings",
                  "displayFilter": true
                }
              }
            ]
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "type": "list",
            "actions": [
              {
                "type": "consent",
                "consents": [
                  {
                    "matcher": {
                      "type": "checkbox",
                      "target": {
                        "selector": "#CybotCookiebotDialogBodyLevelButtonPreferences"
                      }
                    },
                    "toggleAction": {
                      "type": "click",
                      "target": {
                        "selector": "#CybotCookiebotDialogBodyLevelButtonPreferences"
                      }
                    },
                    "type": "A"
                  },
                  {
                    "matcher": {
                      "type": "checkbox",
                      "target": {
                        "selector": "#CybotCookiebotDialogBodyLevelButtonStatistics"
                      }
                    },
                    "toggleAction": {
                      "type": "click",
                      "target": {
                        "selector": "#CybotCookiebotDialogBodyLevelButtonStatistics"
                      }
                    },
                    "type": "B"
                  },
                  {
                    "matcher": {
                      "type": "checkbox",
                      "target": {
                        "selector": "#CybotCookiebotDialogBodyLevelButtonMarketing"
                      }
                    },
                    "toggleAction": {
                      "type": "click",
                      "target": {
                        "selector": "#CybotCookiebotDialogBodyLevelButtonMarketing"
                      }
                    },
                    "type": "F"
                  }
                ]
              }
            ]
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "type": "list",
            "actions": [
              {
                "type": "ifcss",
                "target": {
                  "selector": "#CybotCookiebotDialogBodyUnderlay"
                },
                "trueAction": {
                  "type": "wait",
                  "waitTime": "500"
                }
              },
              {
                "type": "ifcss",
                "target": {
                  "selector": ".dtcookie__accept",
                  "textFilter": "Select All and Continue"
                },
                "trueAction": {
                  "type": "click",
                  "target": {
                    "selector": ".h-dtcookie-decline"
                  }
                },
                "falseAction": {
                  "type": "click",
                  "target": {
                    "selector": ".h-dtcookie-accept"
                  }
                }
              },
              {
                "type": "click",
                "target": {
                  "selector": "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection"
                }
              },
              {
                "type": "click",
                "target": {
                  "selector": ".cb-button",
                  "textFilter": "Save preferences",
                  "displayFilter": true
                }
              },
              {
                "type": "click",
                "target": {
                  "selector": ".cb-button",
                  "textFilter": "Done",
                  "displayFilter": true
                }
              },
              {
                "type": "ifcss",
                "target": {
                  "selector": "#CybotCookiebotDialogBodyLevelButtonAccept",
                  "displayFilter": true
                },
                "trueAction": {
                  "type": "click",
                  "target": {
                    "selector": "#CybotCookiebotDialogBodyLevelButtonAccept"
                  }
                },
                "falseAction": {
                  "type": "ifcss",
                  "target": {
                    "selector": "#CybotCookiebotDialogBodyButtonAcceptSelected",
                    "displayFilter": true
                  },
                  "trueAction": {
                    "type": "click",
                    "target": {
                      "selector": "#CybotCookiebotDialogBodyButtonAcceptSelected"
                    }
                  },
                  "falseAction": {
                    "type": "click",
                    "target": {
                      "selector": "#CybotCookiebotDialogBodyButtonAccept"
                    }
                  }
                }
              },
              {
                "type": "ifcss",
                "target": {
                  "selector": ".js-cookie-settings-close"
                },
                "trueAction": {
                  "type": "list",
                  "actions": [
                    {
                      "type": "click",
                      "target": {
                        "selector": ".js-cookie-settings-close"
                      }
                    },
                    {
                      "type": "close"
                    },
                    {
                      "type": "waitcss",
                      "target": {
                        "selector": ".JegFindesIkke"
                      },
                      "retries": "1",
                      "waitTime": "500"
                    }
                  ]
                }
              }
            ]
          },
          "name": "SAVE_CONSENT"
        },
        {
          "action": {
            "type": "list",
            "actions": [
              {
                "type": "hide",
                "target": {
                  "selector": "#CybotCookiebotDialogBodyUnderlay"
                }
              },
              {
                "type": "hide",
                "target": {
                  "selector": "#CybotCookiebotDialog"
                }
              }
            ]
          },
          "name": "HIDE_CMP"
        }
      ]
    },
    "cookiecontrolcivic": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "displayFilter": true,
              "selector": "#ccc-notify .ccc-notify-button"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "displayFilter": true,
              "selector": "#ccc-notify .ccc-notify-button"
            },
            "type": "css"
          }
        },
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": "#ccc[open]"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "selector": "#ccc[open]"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "parent": null,
                "target": {
                  "selector": "#ccc #ccc-notify .ccc-notify-button",
                  "textFilter": [
                    "Settings",
                    "Cookie Preferences"
                  ]
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "displayFilter": true,
                  "selector": "#ccc-recommended-settings"
                },
                "type": "waitcss"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Analytical Cookies"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Analytical Cookies"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Marketing Cookies"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Marketing Cookies"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Social Sharing Cookies"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Social Sharing Cookies"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Performance"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Performance"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Functionality (incl. social media)"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Functionality (incl. social media)"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "A"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Targeting/Advertising"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Targeting/Advertising"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Google Analytics"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Google Analytics"
                          }
                        },
                        "selector": "#ccc-optional-categories .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  }
                ],
                "type": "consent"
              },
              {
                "target": {
                  "selector": ".optional-cookie button",
                  "textFilter": "Configure Ad Vendors"
                },
                "type": "click"
              },
              {
                "target": {
                  "displayFilter": true,
                  "selector": "#iab-purposes .optional-cookie"
                },
                "type": "waitcss"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Information storage and access"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Information storage and access"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Personalisation"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Personalisation"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Ad selection, delivery, reporting"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Ad selection, delivery, reporting"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Content selection, delivery, reporting"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Content selection, delivery, reporting"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Measurement"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".optional-cookie-header",
                            "textFilter": "Measurement"
                          }
                        },
                        "selector": "#iab-purposes .optional-cookie"
                      },
                      "target": {
                        "selector": "click"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": "#ccc-close"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "cookieinformation": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#coiOverlay, #coiSummery"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "displayFilter": true,
              "selector": "#coiOverlay, #coiSummery"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": ".coi-banner__nextpage, .summary-texts__show-details"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "consents": [
              {
                "matcher": {
                  "parent": {
                    "selector": "#switch-cookie_cat_functional"
                  },
                  "target": {
                    "selector": "input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": "#switch-cookie_cat_functional"
                  },
                  "target": {
                    "selector": "label"
                  },
                  "type": "click"
                },
                "type": "A"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": "#switch-cookie_cat_statistic"
                  },
                  "target": {
                    "selector": "input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": "#switch-cookie_cat_statistic"
                  },
                  "target": {
                    "selector": "label"
                  },
                  "type": "click"
                },
                "type": "A"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": "#switch-cookie_cat_marketing"
                  },
                  "target": {
                    "selector": "input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": "#switch-cookie_cat_marketing"
                  },
                  "target": {
                    "selector": "label"
                  },
                  "type": "click"
                },
                "type": "F"
              }
            ],
            "type": "consent"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": ".coi-banner__accept, .coi-save-btn"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "#CoiBannerOverlay"
                },
                "type": "hide"
              },
              {
                "target": {
                  "selector": "#coiOverlay"
                },
                "type": "hide"
              }
            ],
            "type": "list"
          },
          "name": "HIDE_CMP"
        }
      ]
    },
    "didomi.io": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#didomi-host, #didomi-notice"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": "body.didomi-popup-open, .didomi-notice-banner"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": ".didomi-popup-notice-buttons .didomi-button:not(.didomi-button-highlight), .didomi-notice-banner .didomi-learn-more-button"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "retries": 50,
                "target": {
                  "selector": "#didomi-purpose-cookies"
                },
                "type": "waitcss",
                "waitTime": 50
              },
              {
                "consents": [
                  {
                    "description": "Share (everything) with others",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-share_whith_others]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-share_whith_others]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "X"
                  },
                  {
                    "description": "Information storage and access",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-cookies]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-cookies]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  },
                  {
                    "description": "Content selection, offers and marketing",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-CL-T1Rgm7]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-CL-T1Rgm7]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "description": "Analytics",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-analytics]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-analytics]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "description": "Analytics",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-M9NRHJe3G]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-M9NRHJe3G]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "description": "Ad and content selection",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-advertising_personalization]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-advertising_personalization]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Ad and content selection",
                    "falseAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#didomi-purpose-pub-ciblee"
                          }
                        },
                        "selector": ".didomi-consent-popup-data-processing, .didomi-components-accordion-label-container"
                      },
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-pub-ciblee]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-pub-ciblee]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Ad and content selection - basics",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-q4zlJqdcD]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-q4zlJqdcD]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Ad and content selection - partners and subsidiaries",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-partenaire-cAsDe8jC]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-partenaire-cAsDe8jC]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Ad and content selection - social networks",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-p4em9a8m]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-p4em9a8m]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Ad and content selection - others",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-autres-pub]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-autres-pub]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Social networks",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-reseauxsociaux]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-reseauxsociaux]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "A"
                  },
                  {
                    "description": "Social networks",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-social_media]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-social_media]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "A"
                  },
                  {
                    "description": "Content selection",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-content_personalization]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-content_personalization]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "description": "Ad delivery",
                    "falseAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-ad_delivery]:first-child"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": ".didomi-components-radio__option[aria-describedby=didomi-purpose-ad_delivery]:last-child"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              },
              {
                "action": {
                  "consents": [
                    {
                      "matcher": {
                        "childFilter": {
                          "target": {
                            "selector": ":not(.didomi-components-radio__option--selected)"
                          }
                        },
                        "type": "css"
                      },
                      "trueAction": {
                        "target": {
                          "selector": ":nth-child(2)"
                        },
                        "type": "click"
                      },
                      "falseAction": {
                        "target": {
                          "selector": ":first-child"
                        },
                        "type": "click"
                      },
                      "type": "X"
                    }
                  ],
                  "type": "consent"
                },
                "target": {
                  "selector": ".didomi-components-radio"
                },
                "type": "foreach"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "parent": {
              "selector": ".didomi-consent-popup-footer .didomi-consent-popup-actions"
            },
            "target": {
              "selector": ".didomi-components-button:first-child"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "ez-cookie": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#ez-cookie-dialog"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "displayFilter": true,
              "selector": "#ez-cookie-dialog"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "#ez-cookie-dialog-wrapper"
                },
                "type": "hide"
              }
            ],
            "type": "list"
          },
          "name": "HIDE_CMP"
        },
        {
          "action": null,
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "action": {
              "actions": [
                {
                  "target": {
                    "selector": "label",
                    "textFilter": [
                      "Preferences"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": "label"
                          },
                          "type": "click"
                        },
                        "type": "A"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "label",
                    "textFilter": [
                      "Statistics"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": "label"
                          },
                          "type": "click"
                        },
                        "type": "B"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "label",
                    "textFilter": [
                      "Marketing"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": "label"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                }
              ],
              "type": "list"
            },
            "parent": {
              "selector": "#ez-cookie-options"
            },
            "target": {
              "selector": ".ez-cookie-option"
            },
            "type": "foreach"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": "#ez-ok-cookies"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "future": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "iframeFilter": true,
              "selector": "script[src='cmpui.js']"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "iframeFilter": true,
              "selector": "#mainMoreInfo"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": "#mainMoreInfo"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "action": {
              "actions": [
                {
                  "target": {
                    "selector": "label.form-check-label",
                    "textFilter": [
                      "Information storage and access",
                      "Lagring og adgang til oplysninger"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "click"
                        },
                        "type": "D"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "label.form-check-label",
                    "textFilter": [
                      "Personalisation",
                      "Personalisering"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "label.form-check-label",
                    "textFilter": [
                      "Annoncevalg, levering, rapportering",
                      "Ad selection, delivery, reporting"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "label.form-check-label",
                    "textFilter": [
                      "Udvælgelse af indhold, levering, rapportering",
                      "Content selection, delivery, reporting"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "click"
                        },
                        "type": "E"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "label.form-check-label",
                    "textFilter": [
                      "Measurement",
                      "Måling"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "click"
                        },
                        "type": "B"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                }
              ],
              "type": "list"
            },
            "target": {
              "selector": ".cmp-consent-list .form-check"
            },
            "type": "foreach"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": ".cmp-btn-save"
                },
                "type": "click"
              },
              {
                "target": {
                  "selector": ".cmp-vendors"
                },
                "type": "waitcss"
              },
              {
                "target": {
                  "selector": ".cmp-btn-save"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "ikeaToast": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "[data-widget='cookie-dialog'].toast"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "displayFilter": true,
              "selector": "[data-widget='cookie-dialog'].toast"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "openInTab": true,
                "target": {
                  "selector": "[data-widget='cookie-dialog'].toast .toast__privacy-link",
                  "textFilter": [
                    "Cookie and privacy statement"
                  ]
                },
                "type": "click"
              },
              {
                "target": {
                  "selector": "[data-widget='cookie-dialog'].toast .toast__close"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        }
      ]
    },
    "lemonde.fr": {
      "detectors": [
        {
          "presentMatcher": {
            "type": "css",
            "target": {
              "selector": "#cmp-container-id, .main--cmp"
            }
          },
          "showingMatcher": {
            "type": "css",
            "target": {
              "selector": "#cookie-banner, .main--cmp"
            }
          }
        }
      ],
      "methods": [
        {
          "action": {
            "type": "click",
            "target": {
              "selector": ".message__cookie-settings, .main--cmp"
            }
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "type": "list",
            "actions": [
              {
                "type": "consent",
                "consents": [
                  {
                    "matcher": {
                      "type": "checkbox",
                      "target": {
                        "selector": "#cmp-analytics"
                      }
                    },
                    "toggleAction": {
                      "type": "click",
                      "target": {
                        "selector": "#cmp-analytics"
                      }
                    },
                    "type": "B"
                  },
                  {
                    "matcher": {
                      "type": "checkbox",
                      "target": {
                        "selector": "#cmp-socials"
                      }
                    },
                    "toggleAction": {
                      "type": "click",
                      "target": {
                        "selector": "#cmp-socials"
                      }
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "type": "checkbox",
                      "target": {
                        "selector": "#cmp-ads"
                      }
                    },
                    "toggleAction": {
                      "type": "click",
                      "target": {
                        "selector": "#cmp-ads"
                      }
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "type": "checkbox",
                      "target": {
                        "selector": "#cmp-customization"
                      }
                    },
                    "toggleAction": {
                      "type": "click",
                      "target": {
                        "selector": "#cmp-customization"
                      }
                    },
                    "type": "E"
                  }
                ]
              }
            ]
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "type": "click",
            "target": {
              "selector": "#validate"
            }
          },
          "name": "SAVE_CONSENT"
        },
        {
          "name": "HIDE_CMP"
        }
      ]
    },
    "mydealz.de": {
      "detectors": [
          {
              "presentMatcher": {
                  "type": "css",
                  "target": {
                      "selector": "div.oreo-message.bg--color-white.bRad--t-a.space--h-4.space--v-4.boxShadow--large.seal--pointer-on.overflow--scrollY-raw.space--mt-2"
                  }
              },
              "showingMatcher": {
                  "type": "css",
                  "target": {
                      "selector": "div.oreo-message.bg--color-white.bRad--t-a.space--h-4.space--v-4.boxShadow--large.seal--pointer-on.overflow--scrollY-raw.space--mt-2"
                  }
              }
          }
      ],
      "methods": [
          {
              "action": {
                  "type": "list",
                  "actions": [
                      {
                          "type": "click",
                          "target": {
                              "childFilter": {
                                  "target": {
                                      "selector": "span.btn.btn--mode-primary",
                                      "textFilter": "Einstellungen speichern"
                                  }
                              },
                              "selector": "button.width--all-12"
                          }
                      }
                  ]
              },
              "name": "HIDE_CMP"
          },
          {
              "action": {
                  "type": "click",
                  "target": {
                      "selector": "button.flex--grow-1.text--color-brandPrimary.text--b.space--h-3"
                  }
              },
              "name": "OPEN_OPTIONS"
          },
          {
              "action": {
                  "type": "list",
                  "actions": [
                      {
                          "type": "consent",
                          "consents": [
                              {
                                  "trueAction": {
                                      "type": "click",
                                      "target": {
                                          "selector": "label.size--all-xl.text--b.flex--grow-1.space--mr-3.clickable",
                                          "textFilter": "Personalisierungs-Cookies"
                                      }
                                  },
                                  "type": "F"
                              }
                          ]
                      },
                      {
                          "type": "consent",
                          "consents": [
                              {
                                  "trueAction": {
                                      "type": "click",
                                      "target": {
                                          "selector": "label.size--all-xl.text--b.flex--grow-1.space--mr-3.clickable",
                                          "textFilter": "Funktionalitäts-Cookies"
                                      }
                                  },
                                  "type": "A"
                              }
                          ]
                      },
                      {
                          "type": "consent",
                          "consents": [
                              {
                                  "trueAction": {
                                      "type": "click",
                                      "target": {
                                          "selector": "label.size--all-xl.text--b.flex--grow-1.space--mr-3.clickable",
                                          "textFilter": "Analyse-Cookies"
                                      }
                                  },
                                  "type": "B"
                              }
                          ]
                      }
                  ]
              },
              "name": "DO_CONSENT"
          },
          {
              "action": {
                  "type": "list",
                  "actions": [
                      {
                          "type": "click",
                          "target": {
                              "childFilter": {
                                  "target": {
                                      "selector": "span.btn.btn--mode-primary",
                                      "textFilter": "Einstellungen speichern"
                                  }
                              },
                              "selector": "button.width--all-12"
                          }
                      }
                  ]
              },
              "name": "SAVE_CONSENT"
          }
      ]
  },
    "oil": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": ".as-oil-content-overlay"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": ".as-oil-content-overlay"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": ".as-js-advanced-settings"
                },
                "type": "click"
              },
              {
                "retries": "10",
                "target": {
                  "selector": ".as-oil-cpc__purpose-container"
                },
                "type": "waitcss",
                "waitTime": "250"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": [
                          "Information storage and access",
                          "Opbevaring af og adgang til oplysninger på din enhed"
                        ]
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": [
                          "Information storage and access",
                          "Opbevaring af og adgang til oplysninger på din enhed"
                        ]
                      },
                      "target": {
                        "selector": ".as-oil-cpc__switch"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": [
                          "Personlige annoncer",
                          "Personalisation"
                        ]
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": [
                          "Personlige annoncer",
                          "Personalisation"
                        ]
                      },
                      "target": {
                        "selector": ".as-oil-cpc__switch"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": [
                          "Annoncevalg, levering og rapportering",
                          "Ad selection, delivery, reporting"
                        ]
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": [
                          "Annoncevalg, levering og rapportering",
                          "Ad selection, delivery, reporting"
                        ]
                      },
                      "target": {
                        "selector": ".as-oil-cpc__switch"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": [
                          "Personalisering af indhold",
                          "Content selection, delivery, reporting"
                        ]
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": [
                          "Personalisering af indhold",
                          "Content selection, delivery, reporting"
                        ]
                      },
                      "target": {
                        "selector": ".as-oil-cpc__switch"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".as-oil-cpc__purpose-header",
                            "textFilter": [
                              "Måling",
                              "Measurement"
                            ]
                          }
                        },
                        "selector": ".as-oil-cpc__purpose-container"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".as-oil-cpc__purpose-header",
                            "textFilter": [
                              "Måling",
                              "Measurement"
                            ]
                          }
                        },
                        "selector": ".as-oil-cpc__purpose-container"
                      },
                      "target": {
                        "selector": ".as-oil-cpc__switch"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": "Google"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".as-oil-cpc__purpose-container",
                        "textFilter": "Google"
                      },
                      "target": {
                        "selector": ".as-oil-cpc__switch"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": ".as-oil__btn-optin"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": "div.as-oil"
            },
            "type": "hide"
          },
          "name": "HIDE_CMP"
        }
      ]
    },
    "onetrust": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#onetrust-banner-sdk"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": "#onetrust-banner-sdk"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": "#onetrust-pc-btn-handler, .ot-sdk-show-settings"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "parent": {
                  "childFilter": {
                    "target": {
                      "selector": ".category-header",
                      "textFilter": "Performance Cookies"
                    }
                  },
                  "selector": ".category-item"
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header",
                            "textFilter": "Performance Cookies"
                          }
                        },
                        "selector": ".category-item"
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header",
                            "textFilter": "Performance Cookies"
                          }
                        },
                        "selector": ".category-item"
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "selector": ".category-item",
                  "textFilter": [
                    "Functional Cookies",
                    "Funktionelle cookies"
                  ]
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Functional Cookies",
                          "Funktionelle cookies"
                        ]
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Functional Cookies",
                          "Funktionelle cookies"
                        ]
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "A"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "selector": ".category-item",
                  "textFilter": [
                    "Targeting Cookies",
                    "Målrettede cookies"
                  ]
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Targeting Cookies",
                          "Målrettede cookies"
                        ]
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Targeting Cookies",
                          "Målrettede cookies"
                        ]
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "selector": ".category-item",
                  "textFilter": "Advertising Cookies"
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": "Advertising Cookies"
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": "Advertising Cookies"
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "selector": ".category-item",
                  "textFilter": "Social Media"
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": "Social Media"
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": "Social Media"
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "selector": ".category-item",
                  "textFilter": "Marketing Cookies"
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": "Marketing Cookies"
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": "Marketing Cookies"
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "selector": ".category-item",
                  "textFilter": [
                    "Measurement",
                    "Statistiske cookies"
                  ]
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Measurement",
                          "Statistiske cookies"
                        ]
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Measurement",
                          "Statistiske cookies"
                        ]
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "selector": ".category-item",
                  "textFilter": [
                    "Ad selection, delivery and reporting",
                    "Ad selection, delivery, reporting",
                    "Reklamecookies"
                  ]
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Ad selection, delivery and reporting",
                          "Ad selection, delivery, reporting",
                          "Reklamecookies"
                        ]
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Ad selection, delivery and reporting",
                          "Ad selection, delivery, reporting",
                          "Reklamecookies"
                        ]
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "selector": ".category-item",
                  "textFilter": "Information storage and access"
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": "Information storage and access"
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": "Information storage and access"
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "selector": ".category-item",
                  "textFilter": [
                    "Content selection, delivery, reporting",
                    "Content selection, delivery and reporting"
                  ]
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Content selection, delivery, reporting",
                          "Content selection, delivery and reporting"
                        ]
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".category-item",
                        "textFilter": [
                          "Content selection, delivery, reporting",
                          "Content selection, delivery and reporting"
                        ]
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  }
                ],
                "type": "consent"
              },
              {
                "parent": {
                  "childFilter": {
                    "target": {
                      "selector": ".category-header",
                      "textFilter": "Personalisation"
                    }
                  },
                  "selector": ".category-item"
                },
                "target": {
                  "selector": ".category-menu-switch-handler"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header",
                            "textFilter": "Personalisation"
                          }
                        },
                        "selector": ".category-item"
                      },
                      "target": {
                        "selector": "input.category-switch-handler"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": ".category-header",
                            "textFilter": "Personalisation"
                          }
                        },
                        "selector": ".category-item"
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": ".save-preference-btn-handler"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "#onetrust-consent-sdk"
                },
                "type": "hide"
              }
            ],
            "type": "list"
          },
          "name": "HIDE_CMP"
        }
      ]
    },
    "optanon": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#optanon-menu, .optanon-alert-box-wrapper"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "displayFilter": true,
              "selector": ".optanon-alert-box-wrapper"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": ".optanon-alert-box-wrapper .optanon-toggle-display, a[onclick*='OneTrust.ToggleInfoDisplay()'], a[onclick*='Optanon.ToggleInfoDisplay()']"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": ".preference-menu-item #Your-privacy"
                },
                "type": "click"
              },
              {
                "target": {
                  "selector": "#optanon-vendor-consent-text"
                },
                "type": "click"
              },
              {
                "action": {
                  "consents": [
                    {
                      "matcher": {
                        "target": {
                          "selector": "input"
                        },
                        "type": "checkbox"
                      },
                      "toggleAction": {
                        "target": {
                          "selector": "label"
                        },
                        "type": "click"
                      },
                      "type": "X"
                    }
                  ],
                  "type": "consent"
                },
                "target": {
                  "selector": "#optanon-vendor-consent-list .vendor-item"
                },
                "type": "foreach"
              },
              {
                "target": {
                  "selector": ".vendor-consent-back-link"
                },
                "type": "click"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-performance"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-performance"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "B"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-functional"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-functional"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "E"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-advertising"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-advertising"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "F"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-social"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-social"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "B"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Social Media Cookies"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Social Media Cookies"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "B"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Personalisation"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Personalisation"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "E"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Site monitoring cookies"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Site monitoring cookies"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "B"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Third party privacy-enhanced content"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Third party privacy-enhanced content"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "X"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Performance & Advertising Cookies"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Performance & Advertising Cookies"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "F"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Information storage and access"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Information storage and access"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "D"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Ad selection, delivery, reporting"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Ad selection, delivery, reporting"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "F"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Content selection, delivery, reporting"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Content selection, delivery, reporting"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "E"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Measurement"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Measurement"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "B"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Recommended Cookies"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Recommended Cookies"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "X"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Unclassified Cookies"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Unclassified Cookies"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "X"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Analytical Cookies"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Analytical Cookies"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "B"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Marketing Cookies"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Marketing Cookies"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "F"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Personalization"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Personalization"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "E"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Ad Selection, Delivery & Reporting"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Ad Selection, Delivery & Reporting"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "F"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              },
              {
                "parent": {
                  "selector": "#optanon-menu, .optanon-menu"
                },
                "target": {
                  "selector": ".menu-item-necessary",
                  "textFilter": "Content Selection, Delivery & Reporting"
                },
                "trueAction": {
                  "actions": [
                    {
                      "parent": {
                        "selector": "#optanon-menu, .optanon-menu"
                      },
                      "target": {
                        "selector": ".menu-item-necessary",
                        "textFilter": "Content Selection, Delivery & Reporting"
                      },
                      "type": "click"
                    },
                    {
                      "consents": [
                        {
                          "matcher": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status input"
                            },
                            "type": "checkbox"
                          },
                          "toggleAction": {
                            "parent": {
                              "selector": "#optanon-popup-body-right"
                            },
                            "target": {
                              "selector": ".optanon-status label"
                            },
                            "type": "click"
                          },
                          "type": "E"
                        }
                      ],
                      "type": "consent"
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "parent": {
              "selector": ".optanon-save-settings-button"
            },
            "target": {
              "selector": ".optanon-white-button-middle"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "#optanon-popup-wrapper"
                },
                "type": "hide"
              },
              {
                "target": {
                  "selector": "#optanon-popup-bg"
                },
                "type": "hide"
              },
              {
                "target": {
                  "selector": ".optanon-alert-box-wrapper"
                },
                "type": "hide"
              }
            ],
            "type": "list"
          },
          "name": "HIDE_CMP"
        }
      ]
    },
    "optanon-alternative": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": "#optanon-popup-body-content"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "displayFilter": true,
              "selector": ".optanon-alert-box-wrapper"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": ".optanon-alert-box-wrapper .optanon-toggle-display"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "consents": [
              {
                "description": "Performance Cookies",
                "matcher": {
                  "parent": {
                    "selector": "#optanon-popup-body-content",
                    "textFilter": "Performance Cookies"
                  },
                  "target": {
                    "selector": "input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": "#optanon-popup-body-content",
                    "textFilter": "Performance Cookies"
                  },
                  "target": {
                    "selector": "label"
                  },
                  "type": "click"
                },
                "type": "B"
              },
              {
                "description": "Functional Cookies",
                "matcher": {
                  "parent": {
                    "selector": "#optanon-popup-body-content",
                    "textFilter": "Functional Cookies"
                  },
                  "target": {
                    "selector": "input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": "#optanon-popup-body-content",
                    "textFilter": "Functional Cookies"
                  },
                  "target": {
                    "selector": "label"
                  },
                  "type": "click"
                },
                "type": "A"
              },
              {
                "description": "Targeting Cookies",
                "matcher": {
                  "parent": {
                    "selector": "#optanon-popup-body-content",
                    "textFilter": "Targeting Cookies"
                  },
                  "target": {
                    "selector": "input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": "#optanon-popup-body-content",
                    "textFilter": "Targeting Cookies"
                  },
                  "target": {
                    "selector": "label"
                  },
                  "type": "click"
                },
                "type": "F"
              }
            ],
            "type": "consent"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "parent": {
              "selector": ".optanon-save-settings-button"
            },
            "target": {
              "selector": ".optanon-white-button-middle"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "quantcast": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": ".qc-cmp-ui-container"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": ".qc-cmp-ui-container.qc-cmp-showing"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "#qc-cmp-purpose-button"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": "a[onclick*='updateConsentUi\",3'], a[onclick*='updateConsentUi\\',3']"
                },
                "type": "click"
              },
              {
                "action": {
                  "consents": [
                    {
                      "matcher": {
                        "target": {
                          "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                        },
                        "type": "css"
                      },
                      "toggleAction": {
                        "target": {
                          "selector": ".qc-cmp-toggle"
                        },
                        "type": "click"
                      },
                      "type": "X"
                    }
                  ],
                  "type": "consent"
                },
                "parent": {
                  "selector": ".qc-cmp-vendor-list-body"
                },
                "target": {
                  "selector": ".qc-cmp-toggle-cell"
                },
                "type": "foreach"
              },
              {
                "target": {
                  "selector": "a[onclick*='updateConsentUi\",2'], a[onclick*='updateConsentUi\\',2']"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Information storage and access",
                              "Opbevaring af og adgang til oplysninger"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Information storage and access",
                              "Opbevaring af og adgang til oplysninger"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Ad selection, delivery, reporting",
                              "Annoncevalg, levering og rapportering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Ad selection, delivery, reporting",
                              "Annoncevalg, levering og rapportering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Content selection, delivery, reporting",
                              "Indholdsvalg, levering og rapportering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Content selection, delivery, reporting",
                              "Indholdsvalg, levering og rapportering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Personalisation",
                              "Personalisering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Personalisation",
                              "Personalisering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Measurement",
                              "Måling"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Measurement",
                              "Måling"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-publisher-purposes-table .qc-cmp-purpose-info"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Information storage and access",
                              "Opbevaring af og adgang til oplysninger"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Information storage and access",
                              "Opbevaring af og adgang til oplysninger"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Personalisation",
                              "Personalisering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Personalisation",
                              "Personalisering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Content selection, delivery, reporting",
                              "Indholdsvalg, levering og rapportering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Content selection, delivery, reporting",
                              "Indholdsvalg, levering og rapportering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Ad selection, delivery, reporting",
                              "Annoncevalg, levering og rapportering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Ad selection, delivery, reporting",
                              "Annoncevalg, levering og rapportering"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Measurement",
                              "Måling"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Measurement",
                              "Måling"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-vendors-purposes-table .qc-cmp-purpose-info, .qc-cmp-vendors-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "matcher": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Google"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-google-purposes-table .qc-cmp-purpose-info, .qc-cmp-google-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle.qc-cmp-toggle-on"
                      },
                      "type": "css"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "h4",
                            "textFilter": [
                              "Google"
                            ]
                          }
                        },
                        "selector": ".qc-cmp-google-purposes-table .qc-cmp-purpose-info, .qc-cmp-google-purposes-table .qc-cmp-purpose-infoEDIT"
                      },
                      "target": {
                        "selector": ".qc-cmp-toggle"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": ".qc-cmp-save-and-exit"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": ".qc-cmp-ui-container"
            },
            "type": "hide"
          },
          "name": "HIDE_CMP"
        }
      ]
    },
    "quantcast2": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "[data-tracking-opt-in-overlay]"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": "[data-tracking-opt-in-overlay] [data-tracking-opt-in-learn-more]"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": "[data-tracking-opt-in-overlay] [data-tracking-opt-in-learn-more]"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "type": "wait",
                "waitTime": 500
              },
              {
                "action": {
                  "actions": [
                    {
                      "target": {
                        "selector": "div",
                        "textFilter": [
                          "Information storage and access"
                        ]
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "target": {
                                "selector": "input"
                              },
                              "type": "checkbox"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": "label"
                              },
                              "type": "click"
                            },
                            "type": "D"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    },
                    {
                      "target": {
                        "selector": "div",
                        "textFilter": [
                          "Personalization"
                        ]
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "target": {
                                "selector": "input"
                              },
                              "type": "checkbox"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": "label"
                              },
                              "type": "click"
                            },
                            "type": "F"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    },
                    {
                      "target": {
                        "selector": "div",
                        "textFilter": [
                          "Ad selection, delivery, reporting"
                        ]
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "target": {
                                "selector": "input"
                              },
                              "type": "checkbox"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": "label"
                              },
                              "type": "click"
                            },
                            "type": "F"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    },
                    {
                      "target": {
                        "selector": "div",
                        "textFilter": [
                          "Content selection, delivery, reporting"
                        ]
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "target": {
                                "selector": "input"
                              },
                              "type": "checkbox"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": "label"
                              },
                              "type": "click"
                            },
                            "type": "E"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    },
                    {
                      "target": {
                        "selector": "div",
                        "textFilter": [
                          "Measurement"
                        ]
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "target": {
                                "selector": "input"
                              },
                              "type": "checkbox"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": "label"
                              },
                              "type": "click"
                            },
                            "type": "B"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    },
                    {
                      "target": {
                        "selector": "div",
                        "textFilter": [
                          "Other Partners"
                        ]
                      },
                      "trueAction": {
                        "consents": [
                          {
                            "matcher": {
                              "target": {
                                "selector": "input"
                              },
                              "type": "checkbox"
                            },
                            "toggleAction": {
                              "target": {
                                "selector": "label"
                              },
                              "type": "click"
                            },
                            "type": "X"
                          }
                        ],
                        "type": "consent"
                      },
                      "type": "ifcss"
                    }
                  ],
                  "type": "list"
                },
                "parent": {
                  "childFilter": {
                    "target": {
                      "selector": "input"
                    }
                  },
                  "selector": "[data-tracking-opt-in-overlay] > div > div"
                },
                "target": {
                  "childFilter": {
                    "target": {
                      "selector": "input"
                    }
                  },
                  "selector": ":scope > div"
                },
                "type": "foreach"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": "[data-tracking-opt-in-overlay] [data-tracking-opt-in-save]"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "sharethis": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": ".app_gdpr"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "selector": ".app_gdpr .popup_popup"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "parent": null,
                "target": {
                  "selector": ".app_gdpr .intro_showPurposes"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "consents": [
              {
                "description": "Vendor - Information storage and access",
                "matcher": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Information storage and access"
                  },
                  "target": {
                    "selector": ".switch_switch input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Information storage and access"
                  },
                  "target": {
                    "selector": ".switch_switch"
                  },
                  "type": "click"
                },
                "type": "D"
              },
              {
                "description": "Vendor - Ad selection, delivery, reporting",
                "matcher": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Ad selection, delivery, reporting"
                  },
                  "target": {
                    "selector": ".switch_switch input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Ad selection, delivery, reporting"
                  },
                  "target": {
                    "selector": ".switch_switch"
                  },
                  "type": "click"
                },
                "type": "F"
              },
              {
                "description": "Vendor - Personalisation",
                "matcher": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Personalisation"
                  },
                  "target": {
                    "selector": ".switch_switch input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Personalisation"
                  },
                  "target": {
                    "selector": ".switch_switch"
                  },
                  "type": "click"
                },
                "type": "E"
              },
              {
                "description": "Vendor - Content selection, delivery, reporting",
                "matcher": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Content selection, delivery, reporting"
                  },
                  "target": {
                    "selector": ".switch_switch input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Content selection, delivery, reporting"
                  },
                  "target": {
                    "selector": ".switch_switch"
                  },
                  "type": "click"
                },
                "type": "E"
              },
              {
                "description": "Vendor - Measurement",
                "matcher": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Measurement"
                  },
                  "target": {
                    "selector": ".switch_switch input"
                  },
                  "type": "checkbox"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".purposes_purposes",
                    "textFilter": "Measurement"
                  },
                  "target": {
                    "selector": ".switch_switch"
                  },
                  "type": "click"
                },
                "type": "B"
              }
            ],
            "type": "consent"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "parent": null,
            "target": {
              "selector": ".app_gdpr .details_save"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "sourcepoint": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": "[class^='sp_message_container']"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "selector": "[class^='sp_message_container']"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "parent": null,
            "target": {
              "selector": "[class^='sp_message_container'] button",
              "textFilter": [
                "Consent",
                "Options"
              ]
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        }
      ]
    },
    "sourcepointframe": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "html.w-mod-js .privacy-container"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": "html.w-mod-js .privacy-container"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "falseAction": {
                  "consents": [
                    {
                      "matcher": {
                        "target": {
                          "selector": ".priv-purpose-container a#personalisation[value='ON']"
                        },
                        "type": "css"
                      },
                      "toggleAction": {
                        "target": {
                          "selector": ".priv-purpose-container a#personalisation"
                        },
                        "type": "click"
                      },
                      "type": "E"
                    },
                    {
                      "matcher": {
                        "target": {
                          "selector": ".priv-purpose-container a#ad-selection-delivery-reporting[value='ON']"
                        },
                        "type": "css"
                      },
                      "toggleAction": {
                        "target": {
                          "selector": ".priv-purpose-container a#ad-selection-delivery-reporting"
                        },
                        "type": "click"
                      },
                      "type": "F"
                    },
                    {
                      "matcher": {
                        "target": {
                          "selector": ".priv-purpose-container a#measurement[value='ON']"
                        },
                        "type": "css"
                      },
                      "toggleAction": {
                        "target": {
                          "selector": ".priv-purpose-container a#measurement"
                        },
                        "type": "click"
                      },
                      "type": "B"
                    },
                    {
                      "matcher": {
                        "target": {
                          "selector": ".priv-purpose-container a#information-storage-andaaccess[value='ON']"
                        },
                        "type": "css"
                      },
                      "toggleAction": {
                        "target": {
                          "selector": ".priv-purpose-container a#information-storage-andaaccess"
                        },
                        "type": "click"
                      },
                      "type": "D"
                    },
                    {
                      "matcher": {
                        "target": {
                          "selector": ".priv-purpose-container a#content-sselection-delivery-reporting[value='ON']"
                        },
                        "type": "css"
                      },
                      "toggleAction": {
                        "target": {
                          "selector": ".priv-purpose-container a#content-sselection-delivery-reporting"
                        },
                        "type": "click"
                      },
                      "type": "E"
                    }
                  ],
                  "type": "consent"
                },
                "target": {
                  "selector": ".priv-vendor-block"
                },
                "trueAction": {
                  "action": {
                    "actions": [
                      {
                        "target": {
                          "selector": ".purpose-title",
                          "textFilter": [
                            "Opbevaring af og adgang til oplysninger",
                            "Information storage and access"
                          ]
                        },
                        "trueAction": {
                          "falseAction": {
                            "consents": [
                              {
                                "falseAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "off"
                                  },
                                  "type": "click"
                                },
                                "matcher": {
                                  "target": {
                                    "selector": "a.neutral.on"
                                  },
                                  "type": "css"
                                },
                                "trueAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "on"
                                  },
                                  "type": "click"
                                },
                                "type": "D"
                              }
                            ],
                            "type": "consent"
                          },
                          "target": {
                            "selector": "a.switch-bg"
                          },
                          "trueAction": {
                            "consents": [
                              {
                                "matcher": {
                                  "target": {
                                    "selector": "a.switch-bg.on"
                                  },
                                  "type": "css"
                                },
                                "toggleAction": {
                                  "target": {
                                    "selector": "a.switch-bg"
                                  },
                                  "type": "click"
                                },
                                "type": "D"
                              }
                            ],
                            "type": "consent"
                          },
                          "type": "ifcss"
                        },
                        "type": "ifcss"
                      },
                      {
                        "target": {
                          "selector": ".purpose-title",
                          "textFilter": [
                            "Personalisering",
                            "Personalisation"
                          ]
                        },
                        "trueAction": {
                          "falseAction": {
                            "consents": [
                              {
                                "falseAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "off"
                                  },
                                  "type": "click"
                                },
                                "matcher": {
                                  "target": {
                                    "selector": "a.neutral.on"
                                  },
                                  "type": "css"
                                },
                                "trueAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "on"
                                  },
                                  "type": "click"
                                },
                                "type": "F"
                              }
                            ],
                            "type": "consent"
                          },
                          "target": {
                            "selector": "a.switch-bg"
                          },
                          "trueAction": {
                            "consents": [
                              {
                                "matcher": {
                                  "target": {
                                    "selector": "a.switch-bg.on"
                                  },
                                  "type": "css"
                                },
                                "toggleAction": {
                                  "target": {
                                    "selector": "a.switch-bg"
                                  },
                                  "type": "click"
                                },
                                "type": "F"
                              }
                            ],
                            "type": "consent"
                          },
                          "type": "ifcss"
                        },
                        "type": "ifcss"
                      },
                      {
                        "target": {
                          "selector": ".purpose-title",
                          "textFilter": [
                            "Annoncevalg, levering og rapportering",
                            "Ad selection, delivery, reporting"
                          ]
                        },
                        "trueAction": {
                          "falseAction": {
                            "consents": [
                              {
                                "falseAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "off"
                                  },
                                  "type": "click"
                                },
                                "matcher": {
                                  "target": {
                                    "selector": "a.neutral.on"
                                  },
                                  "type": "css"
                                },
                                "trueAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "on"
                                  },
                                  "type": "click"
                                },
                                "type": "F"
                              }
                            ],
                            "type": "consent"
                          },
                          "target": {
                            "selector": "a.switch-bg"
                          },
                          "trueAction": {
                            "consents": [
                              {
                                "matcher": {
                                  "target": {
                                    "selector": "a.switch-bg.on"
                                  },
                                  "type": "css"
                                },
                                "toggleAction": {
                                  "target": {
                                    "selector": "a.switch-bg"
                                  },
                                  "type": "click"
                                },
                                "type": "F"
                              }
                            ],
                            "type": "consent"
                          },
                          "type": "ifcss"
                        },
                        "type": "ifcss"
                      },
                      {
                        "target": {
                          "selector": ".purpose-title",
                          "textFilter": [
                            "Måling",
                            "Measurement"
                          ]
                        },
                        "trueAction": {
                          "falseAction": {
                            "consents": [
                              {
                                "falseAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "off"
                                  },
                                  "type": "click"
                                },
                                "matcher": {
                                  "target": {
                                    "selector": "a.neutral.on"
                                  },
                                  "type": "css"
                                },
                                "trueAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "on"
                                  },
                                  "type": "click"
                                },
                                "type": "B"
                              }
                            ],
                            "type": "consent"
                          },
                          "target": {
                            "selector": "a.switch-bg"
                          },
                          "trueAction": {
                            "consents": [
                              {
                                "matcher": {
                                  "target": {
                                    "selector": "a.switch-bg.on"
                                  },
                                  "type": "css"
                                },
                                "toggleAction": {
                                  "target": {
                                    "selector": "a.switch-bg"
                                  },
                                  "type": "click"
                                },
                                "type": "B"
                              }
                            ],
                            "type": "consent"
                          },
                          "type": "ifcss"
                        },
                        "type": "ifcss"
                      },
                      {
                        "target": {
                          "selector": ".purpose-title",
                          "textFilter": [
                            "Indholdsvalg, levering og rapportering",
                            "Content selection, delivery, reporting"
                          ]
                        },
                        "trueAction": {
                          "falseAction": {
                            "consents": [
                              {
                                "falseAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "off"
                                  },
                                  "type": "click"
                                },
                                "matcher": {
                                  "target": {
                                    "selector": "a.neutral.on"
                                  },
                                  "type": "css"
                                },
                                "trueAction": {
                                  "parent": {
                                    "selector": "a.neutral"
                                  },
                                  "target": {
                                    "selector": "div",
                                    "textFilter": "on"
                                  },
                                  "type": "click"
                                },
                                "type": "E"
                              }
                            ],
                            "type": "consent"
                          },
                          "target": {
                            "selector": "a.switch-bg"
                          },
                          "trueAction": {
                            "consents": [
                              {
                                "matcher": {
                                  "target": {
                                    "selector": "a.switch-bg.on"
                                  },
                                  "type": "css"
                                },
                                "toggleAction": {
                                  "target": {
                                    "selector": "a.switch-bg"
                                  },
                                  "type": "click"
                                },
                                "type": "E"
                              }
                            ],
                            "type": "consent"
                          },
                          "type": "ifcss"
                        },
                        "type": "ifcss"
                      }
                    ],
                    "type": "list"
                  },
                  "target": {
                    "selector": ".priv-vendor-block .accordian-parent"
                  },
                  "type": "foreach"
                },
                "type": "ifcss"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": ".priv-save-btn"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": ".bg-overlay"
            },
            "type": "hide"
          },
          "name": "HIDE_CMP"
        },
        {
          "name": "OPEN_OPTIONS"
        }
      ]
    },
    "sourcepointpopup": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "iframeFilter": true,
              "selector": ".message-container .message.type-modal"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": ".message-container .message.type-modal"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "name": "HIDE_CMP"
        },
        {
          "action": {
            "target": {
              "selector": ".message-button",
              "textFilter": [
                "Ret indstillinger",
                "Cookie Settings",
                "Voir les paramètres"
              ]
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "name": "DO_CONSENT"
        },
        {
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "tealium.com": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#__tealiumGDPRecModal, script[id^=tealium]"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": "#__tealiumGDPRecModal .privacy_prompt, .cookie_banner_background"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": "#__tealiumGDPRecModal .consent_prefs_button, #sliding-popup .popup-actions .eu-cookie-change-settings"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "retries": 50,
                "target": {
                  "selector": "#__tealiumGDPRcpPrefs .privacy_prompt_content"
                },
                "type": "waitcss",
                "waitTime": 50
              },
              {
                "consents": [
                  {
                    "description": "Analytics",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat1"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat1"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat1]"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "description": "Unknown",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat2"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat2"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat2]"
                      },
                      "type": "click"
                    },
                    "type": "X"
                  },
                  {
                    "description": "Ads selection",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat3"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat3"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat3]"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Search content selection",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat4"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat4"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat4]"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "description": "Email targeting",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat5"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat5"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat5]"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "description": "Content selection",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat6"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat6"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat6]"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "description": "Sharing with social networks",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat7"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat7"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat7]"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "description": "Personalized offers",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat8"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat8"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat8]"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "description": "Misc personalized experience",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat9"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat9"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat9]"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "description": "Cookie match for ads",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat10"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat10"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat10]"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Unified customer database",
                    "matcher": {
                      "target": {
                        "selector": "#__tealiumGDPRcpPrefs #toggle_cat11"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "childFilter": {
                          "target": {
                            "selector": "#toggle_cat11"
                          }
                        },
                        "selector": ".pp_category_toggle, .privacy_prompt_content td"
                      },
                      "target": {
                        "selector": "label[for=toggle_cat11]"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": "#__tealiumGDPRcpPrefs #preferences_prompt_submit"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "theGuardian": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "#cmpContainer"
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": "#cmpContainer button",
              "textFilter": [
                "Options"
              ]
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "target": {
              "selector": "#cmpContainer"
            },
            "type": "hide"
          },
          "name": "HIDE_CMP"
        },
        {
          "action": {
            "target": {
              "selector": "#cmpContainer button",
              "textFilter": [
                "Options"
              ]
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "action": {
              "actions": [
                {
                  "target": {
                    "selector": "[class*='CmpCollapsible']",
                    "textFilter": [
                      "Information storage and access"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[value='off']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[value='on']"
                          },
                          "type": "click"
                        },
                        "type": "D"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "[class*='CmpCollapsible']",
                    "textFilter": [
                      "Personalisation"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[value='off']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[value='on']"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "[class*='CmpCollapsible']",
                    "textFilter": [
                      "Ad selection, delivery, reporting"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[value='off']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[value='on']"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "[class*='CmpCollapsible']",
                    "textFilter": [
                      "Ad selection, delivery, reporting"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[value='off']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[value='on']"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "[class*='CmpCollapsible']",
                    "textFilter": [
                      "Content selection, delivery, reporting"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[value='off']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[value='on']"
                          },
                          "type": "click"
                        },
                        "type": "E"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                },
                {
                  "target": {
                    "selector": "[class*='CmpCollapsible']",
                    "textFilter": [
                      "Measurement"
                    ]
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "falseAction": {
                          "target": {
                            "selector": "input[value='off']"
                          },
                          "type": "click"
                        },
                        "trueAction": {
                          "target": {
                            "selector": "input[value='on']"
                          },
                          "type": "click"
                        },
                        "type": "B"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                }
              ],
              "type": "list"
            },
            "target": {
              "childFilter": {
                "target": {
                  "selector": "[class*='radioContainerStyles']"
                }
              },
              "selector": "#cmpContainer [class*='titleTabStyles']"
            },
            "type": "foreach"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": "#cmpContainer button",
              "textFilter": [
                "Save and close"
              ]
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "trustarcbar": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": "#truste-consent-content, .truste-consent-content"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "selector": "#truste-consent-content, .truste-consent-content"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "parent": null,
                "target": {
                  "displayFilter": true,
                  "selector": "#truste-show-consent"
                },
                "type": "waitcss"
              },
              {
                "parent": null,
                "target": {
                  "selector": "#truste-show-consent"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        }
      ]
    },
    "trustarcframe": {
      "detectors": [
        {
          "presentMatcher": {
            "target": {
              "selector": "title",
              "textFilter": [
                "TrustArc Preference Manager"
              ]
            },
            "type": "css"
          },
          "showingMatcher": {
            "target": {
              "selector": ".gdpr .switch span.on, .pdynamicbutton a"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "negated": false,
                "retries": 2,
                "target": {
                  "selector": ".shp"
                },
                "type": "waitcss",
                "waitTime": 250
              },
              {
                "parent": {
                  "selector": ".pdynamicbutton"
                },
                "target": {
                  "selector": ".shp"
                },
                "type": "click"
              },
              {
                "negated": false,
                "retries": 2,
                "target": {
                  "selector": ".pdynamicbutton .advance"
                },
                "type": "waitcss",
                "waitTime": 250
              },
              {
                "target": {
                  "selector": ".prefPanel > div[role~='group']"
                },
                "trueAction": {
                  "actions": [
                    {
                      "target": {
                        "selector": ".pdynamicbutton .advance"
                      },
                      "type": "click"
                    },
                    {
                      "negated": false,
                      "retries": 100,
                      "target": {
                        "selector": ".switch span.on"
                      },
                      "type": "waitcss",
                      "waitTime": 250
                    }
                  ],
                  "type": "list"
                },
                "type": "ifcss"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "falseAction": {
              "axis": "y",
              "dragTarget": {
                "target": {
                  "selector": ".options h2",
                  "textFilter": [
                    "Required Cookies",
                    "NØDVENDIGE COOKIES"
                  ]
                }
              },
              "target": {
                "selector": ".ui-slider-handle"
              },
              "type": "slide"
            },
            "target": {
              "selector": ".prefPanel > div[role~='group']"
            },
            "trueAction": {
              "action": {
                "actions": [
                  {
                    "target": {
                      "selector": "h3",
                      "textFilter": [
                        "Functional",
                        "Funktionalitets"
                      ]
                    },
                    "trueAction": {
                      "consents": [
                        {
                          "falseAction": {
                            "target": {
                              "selector": ".switch span.on"
                            },
                            "type": "click"
                          },
                          "matcher": {
                            "parent": {
                              "selector": ".cookiecat"
                            },
                            "target": {
                              "selector": "span.off.active"
                            },
                            "type": "css"
                          },
                          "trueAction": {
                            "target": {
                              "selector": ".switch span.off"
                            },
                            "type": "click"
                          },
                          "type": "A"
                        }
                      ],
                      "type": "consent"
                    },
                    "type": "ifcss"
                  },
                  {
                    "target": {
                      "selector": "h3",
                      "textFilter": [
                        "Analytics"
                      ]
                    },
                    "trueAction": {
                      "consents": [
                        {
                          "falseAction": {
                            "target": {
                              "selector": ".switch span.on"
                            },
                            "type": "click"
                          },
                          "matcher": {
                            "parent": {
                              "selector": ".cookiecat"
                            },
                            "target": {
                              "selector": "span.off.active"
                            },
                            "type": "css"
                          },
                          "trueAction": {
                            "target": {
                              "selector": ".switch span.off"
                            },
                            "type": "click"
                          },
                          "type": "B"
                        }
                      ],
                      "type": "consent"
                    },
                    "type": "ifcss"
                  },
                  {
                    "target": {
                      "selector": "h3",
                      "textFilter": [
                        "marketing and advertising"
                      ]
                    },
                    "trueAction": {
                      "consents": [
                        {
                          "falseAction": {
                            "target": {
                              "selector": ".switch span.on"
                            },
                            "type": "click"
                          },
                          "matcher": {
                            "parent": {
                              "selector": ".cookiecat"
                            },
                            "target": {
                              "selector": "span.off.active"
                            },
                            "type": "css"
                          },
                          "trueAction": {
                            "target": {
                              "selector": ".switch span.off"
                            },
                            "type": "click"
                          },
                          "type": "F"
                        }
                      ],
                      "type": "consent"
                    },
                    "type": "ifcss"
                  },
                  {
                    "target": {
                      "selector": "h3",
                      "textFilter": [
                        "advertising",
                        "Annonceringscookies"
                      ]
                    },
                    "trueAction": {
                      "consents": [
                        {
                          "falseAction": {
                            "target": {
                              "selector": ".switch span.on"
                            },
                            "type": "click"
                          },
                          "matcher": {
                            "parent": {
                              "selector": ".cookiecat"
                            },
                            "target": {
                              "selector": "span.off.active"
                            },
                            "type": "css"
                          },
                          "trueAction": {
                            "target": {
                              "selector": ".switch span.off"
                            },
                            "type": "click"
                          },
                          "type": "F"
                        }
                      ],
                      "type": "consent"
                    },
                    "type": "ifcss"
                  },
                  {
                    "target": {
                      "selector": "h3",
                      "textFilter": [
                        "Personalised email marketing"
                      ]
                    },
                    "trueAction": {
                      "consents": [
                        {
                          "falseAction": {
                            "target": {
                              "selector": ".switch span.on"
                            },
                            "type": "click"
                          },
                          "matcher": {
                            "parent": {
                              "selector": ".cookiecat"
                            },
                            "target": {
                              "selector": "span.off.active"
                            },
                            "type": "css"
                          },
                          "trueAction": {
                            "target": {
                              "selector": ".switch span.off"
                            },
                            "type": "click"
                          },
                          "type": "F"
                        }
                      ],
                      "type": "consent"
                    },
                    "type": "ifcss"
                  },
                  {
                    "target": {
                      "selector": "h3",
                      "textFilter": [
                        "Social media & marketing"
                      ]
                    },
                    "trueAction": {
                      "consents": [
                        {
                          "falseAction": {
                            "target": {
                              "selector": ".switch span.on"
                            },
                            "type": "click"
                          },
                          "matcher": {
                            "parent": {
                              "selector": ".cookiecat"
                            },
                            "target": {
                              "selector": "span.off.active"
                            },
                            "type": "css"
                          },
                          "trueAction": {
                            "target": {
                              "selector": ".switch span.off"
                            },
                            "type": "click"
                          },
                          "type": "F"
                        }
                      ],
                      "type": "consent"
                    },
                    "type": "ifcss"
                  }
                ],
                "type": "list"
              },
              "target": {
                "selector": ".prefPanel > div[role~='group']"
              },
              "type": "foreach"
            },
            "type": "ifcss"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": ".submit"
                },
                "type": "click"
              },
              {
                "negated": false,
                "retries": 1000,
                "target": {
                  "selector": ".close"
                },
                "type": "waitcss",
                "waitTime": 250
              },
              {
                "target": {
                  "selector": ".close"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "umf.dk": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": "#portal-cookieoptout"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "selector": "#portal-cookieoptout"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "consents": [
              {
                "falseAction": {
                  "target": {
                    "selector": "#portal-cookieoptout a[href='./#cookieoptout']"
                  },
                  "type": "click"
                },
                "trueAction": {
                  "target": {
                    "selector": "#portal-cookieoptout a[href='./#cookieoptin']"
                  },
                  "type": "click"
                },
                "type": "B"
              }
            ],
            "type": "consent"
          },
          "name": "DO_CONSENT"
        }
      ]
    },
    "uniconsent": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": ".unic .unic-box, .unic .unic-bar"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "selector": ".unic .unic-box, .unic .unic-bar"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "parent": null,
                "target": {
                  "selector": ".unic .unic-box button, .unic .unic-bar button",
                  "textFilter": "Manage Options"
                },
                "type": "waitcss"
              },
              {
                "parent": null,
                "target": {
                  "selector": ".unic .unic-box button, .unic .unic-bar button",
                  "textFilter": "Manage Options"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "action": {
              "actions": [
                {
                  "consents": [
                    {
                      "description": "Information storage and access",
                      "matcher": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Information storage and access"
                        },
                        "target": {
                          "selector": "input"
                        },
                        "type": "checkbox"
                      },
                      "toggleAction": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Information storage and access"
                        },
                        "target": {
                          "selector": "label"
                        },
                        "type": "click"
                      },
                      "type": "D"
                    },
                    {
                      "description": "Personalisation",
                      "matcher": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Personalisation"
                        },
                        "target": {
                          "selector": "input"
                        },
                        "type": "checkbox"
                      },
                      "toggleAction": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Personalisation"
                        },
                        "target": {
                          "selector": "label"
                        },
                        "type": "click"
                      },
                      "type": "E"
                    },
                    {
                      "description": "Ad selection, delivery, reporting",
                      "matcher": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Ad selection, delivery, reporting"
                        },
                        "target": {
                          "selector": "input"
                        },
                        "type": "checkbox"
                      },
                      "toggleAction": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Ad selection, delivery, reporting"
                        },
                        "target": {
                          "selector": "label"
                        },
                        "type": "click"
                      },
                      "type": "F"
                    },
                    {
                      "description": "Content selection, delivery, reporting",
                      "matcher": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Content selection, delivery, reporting"
                        },
                        "target": {
                          "selector": "input"
                        },
                        "type": "checkbox"
                      },
                      "toggleAction": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Content selection, delivery, reporting"
                        },
                        "target": {
                          "selector": "label"
                        },
                        "type": "click"
                      },
                      "type": "E"
                    },
                    {
                      "description": "Measurement",
                      "matcher": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Measurement"
                        },
                        "target": {
                          "selector": "input"
                        },
                        "type": "checkbox"
                      },
                      "toggleAction": {
                        "parent": {
                          "selector": ".columns",
                          "textFilter": "Measurement"
                        },
                        "target": {
                          "selector": "label"
                        },
                        "type": "click"
                      },
                      "type": "B"
                    }
                  ],
                  "type": "consent"
                },
                {
                  "target": {
                    "selector": ".column",
                    "textFilter": "Google Personalization"
                  },
                  "trueAction": {
                    "consents": [
                      {
                        "description": "Google Personalization",
                        "matcher": {
                          "target": {
                            "selector": "input"
                          },
                          "type": "checkbox"
                        },
                        "toggleAction": {
                          "target": {
                            "selector": "label"
                          },
                          "type": "click"
                        },
                        "type": "F"
                      }
                    ],
                    "type": "consent"
                  },
                  "type": "ifcss"
                }
              ],
              "type": "list"
            },
            "target": {
              "selector": ".unic-purposes"
            },
            "type": "foreach"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "parent": null,
            "target": {
              "selector": ".unic .unic-box button, .unic .unic-bar button",
              "textFilter": "Save Choices"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "wordpressgdpr": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": ".wpgdprc-consent-bar"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "displayFilter": true,
              "selector": ".wpgdprc-consent-bar"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "parent": null,
            "target": {
              "selector": ".wpgdprc-consent-bar .wpgdprc-consent-bar__settings",
              "textFilter": null
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": ".wpgdprc-consent-modal .wpgdprc-button",
                  "textFilter": "Eyeota"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "description": "Eyeota Cookies",
                    "matcher": {
                      "parent": {
                        "selector": ".wpgdprc-consent-modal__description",
                        "textFilter": "Eyeota"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".wpgdprc-consent-modal__description",
                        "textFilter": "Eyeota"
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "X"
                  }
                ],
                "type": "consent"
              },
              {
                "target": {
                  "selector": ".wpgdprc-consent-modal .wpgdprc-button",
                  "textFilter": "Advertising"
                },
                "type": "click"
              },
              {
                "consents": [
                  {
                    "description": "Advertising Cookies",
                    "matcher": {
                      "parent": {
                        "selector": ".wpgdprc-consent-modal__description",
                        "textFilter": "Advertising"
                      },
                      "target": {
                        "selector": "input"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".wpgdprc-consent-modal__description",
                        "textFilter": "Advertising"
                      },
                      "target": {
                        "selector": "label"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "parent": null,
            "target": {
              "selector": ".wpgdprc-button",
              "textFilter": "Save my settings"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "chandago": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": "#ac-Banner"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "displayFilter": true,
              "selector": "#ac-Banner._acc_visible"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "parent": null,
            "target": {
              "selector": "#ac-Banner button._acc_configure",
              "textFilter": "Configurer"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "retries": 50,
                "target": {
                  "selector": "#ac_notice._acc_visible"
                },
                "type": "waitcss",
                "waitTime": 10
              },
              {
                "consents": [
                  {
                    "description": "Information storage and access",
                    "falseAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='1'] .i-ko"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='1'] .i-ok"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  },
                  {
                    "description": "Preferences and Functionality",
                    "falseAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='2'] .i-ko"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='2'] .i-ok"
                      },
                      "type": "click"
                    },
                    "type": "A"
                  },
                  {
                    "description": "Ad selection, delivery, reporting",
                    "falseAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='3'] .i-ko"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='3'] .i-ok"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "description": "Content selection, delivery, reporting",
                    "falseAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='4'] .i-ko"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='4'] .i-ok"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "description": "Measurement",
                    "falseAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='5'] .i-ko"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "._acc_box[data-usage='5'] .i-ok"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "parent": null,
            "target": {
              "selector": "._acc_next  ",
              "textFilter": "Enregistrer"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "SFR": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": "#CkC"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "displayFilter": true,
              "selector": "#CkC"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "parent": null,
            "target": {
              "selector": "#CkC .P",
              "textFilter": "Je paramètre"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "retries": 50,
                "target": {
                  "selector": "#ac_notice._acc_visible"
                },
                "type": "waitcss",
                "waitTime": 10
              },
              {
                "consents": [
                  {
                    "description": "Information storage and access",
                    "falseAction": {
                      "target": {
                        "selector": "#R3V1"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "#A3V1"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  },
                  {
                    "description": "Preferences and Functionality",
                    "falseAction": {
                      "target": {
                        "selector": "#R3V2"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "#A3V2"
                      },
                      "type": "click"
                    },
                    "type": "A"
                  },
                  {
                    "description": "Ad selection, delivery, reporting",
                    "falseAction": {
                      "target": {
                        "selector": "#R3V4"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "#A3V4"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  },
                  {
                    "description": "Content selection, delivery, reporting",
                    "falseAction": {
                      "target": {
                        "selector": "#R3V8"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "#A3V8"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "description": "Measurement",
                    "falseAction": {
                      "target": {
                        "selector": "#R3V16"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "#A3V16"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Statistiques",
                    "falseAction": {
                      "target": {
                        "selector": "#R2V1"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "#A2V1"
                      },
                      "type": "click"
                    },
                    "type": "X"
                  },
                  {
                    "description": "Personalisation de l'expérience SFR",
                    "falseAction": {
                      "target": {
                        "selector": "#R2V2"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "#A2V2"
                      },
                      "type": "click"
                    },
                    "type": "X"
                  },
                  {
                    "description": "Publicitée ciblée",
                    "falseAction": {
                      "target": {
                        "selector": "#R2V4"
                      },
                      "type": "click"
                    },
                    "trueAction": {
                      "target": {
                        "selector": "#A2V4"
                      },
                      "type": "click"
                    },
                    "type": "X"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "parent": null,
            "target": {
              "selector": "#eTcP .P",
              "textFilter": "Valider"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "Webedia": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": ".app_gdpr--2k2uB"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "displayFilter": true,
              "selector": ".banner_banner--3pjXd"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "parent": null,
            "target": {
              "selector": ".banner_consent--2qj6F .button_invert--1bse9",
              "textFilter": "Gérer mes choix"
            },
            "type": "click"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "actions": [
              {
                "retries": 50,
                "target": {
                  "selector": ".popup_popup--1TXMW"
                },
                "type": "waitcss",
                "waitTime": 10
              },
              {
                "consents": [
                  {
                    "description": "Information Storage and Access",
                    "matcher": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Conservation et accès aux informations"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Conservation et accès aux informations"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "click"
                    },
                    "type": "D"
                  },
                  {
                    "description": "Preferences and Functionality",
                    "matcher": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Personnalisation"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Personnalisation"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "click"
                    },
                    "type": "A"
                  },
                  {
                    "description": "Ad selection, delivery, and reporting",
                    "matcher": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Sélection, diffusion et signalement de publicités"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Sélection, diffusion et signalement de publicités"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "click"
                    },
                    "type": "F"
                  },
                  {
                    "description": "Content selection, delivery, and reporting",
                    "matcher": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Sélection, diffusion et signalement de contenu"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Sélection, diffusion et signalement de contenu"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "click"
                    },
                    "type": "E"
                  },
                  {
                    "description": "Performance and Analytics",
                    "matcher": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Évaluation"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "checkbox"
                    },
                    "toggleAction": {
                      "parent": {
                        "selector": ".summary_purposeItem--3WVlI",
                        "textFilter": "Évaluation"
                      },
                      "target": {
                        "selector": ".switch_native--3vL1-"
                      },
                      "type": "click"
                    },
                    "type": "B"
                  }
                ],
                "type": "consent"
              }
            ],
            "type": "list"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "parent": null,
            "target": {
              "selector": ".popup_content--2JBXA .details_save--1ja7w",
              "textFilter": "Valider et continuer sur le site"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "springer": {
      "detectors": [
        {
          "presentMatcher": {
            "parent": null,
            "target": {
              "selector": ".cmp-app_gdpr"
            },
            "type": "css"
          },
          "showingMatcher": {
            "parent": null,
            "target": {
              "displayFilter": true,
              "selector": ".cmp-popup_popup"
            },
            "type": "css"
          }
        }
      ],
      "methods": [
        {
          "action": {
            "actions": [
              {
                "target": {
                  "selector": ".cmp-intro_rejectAll"
                },
                "type": "click"
              },
              {
                "type": "wait",
                "waitTime": 250
              },
              {
                "target": {
                  "selector": ".cmp-purposes_purposeItem:not(.cmp-purposes_selectedPurpose)"
                },
                "type": "click"
              }
            ],
            "type": "list"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "consents": [
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Przechowywanie informacji na urządzeniu lub dostęp do nich",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Przechowywanie informacji na urządzeniu lub dostęp do nich",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "D"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Wybór podstawowych reklam",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Wybór podstawowych reklam",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "F"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Tworzenie profilu spersonalizowanych reklam",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Tworzenie profilu spersonalizowanych reklam",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "F"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Wybór spersonalizowanych reklam",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Wybór spersonalizowanych reklam",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "E"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Tworzenie profilu spersonalizowanych treści",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Tworzenie profilu spersonalizowanych treści",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "E"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Wybór spersonalizowanych treści",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Wybór spersonalizowanych treści",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "B"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Pomiar wydajności reklam",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Pomiar wydajności reklam",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "B"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Pomiar wydajności treści",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Pomiar wydajności treści",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "B"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Stosowanie badań rynkowych w celu generowania opinii odbiorców",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Stosowanie badań rynkowych w celu generowania opinii odbiorców",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "X"
              },
              {
                "matcher": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Opracowywanie i ulepszanie produktów",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch .cmp-switch_isSelected"
                  },
                  "type": "css"
                },
                "toggleAction": {
                  "parent": {
                    "selector": ".cmp-purposes_detailHeader",
                    "textFilter": "Opracowywanie i ulepszanie produktów",
                    "childFilter": {
                      "target": {
                        "selector": ".cmp-switch_switch"
                      }
                    }
                  },
                  "target": {
                    "selector": ".cmp-switch_switch:not(.cmp-switch_isSelected)"
                  },
                  "type": "click"
                },
                "type": "X"
              }
            ],
            "type": "consent"
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "target": {
              "selector": ".cmp-details_save"
            },
            "type": "click"
          },
          "name": "SAVE_CONSENT"
        }
      ]
    },
    "DRCC": {
      "detectors": [
        {
          "presentMatcher": {
            "type": "css",
            "target": {
              "selector": "#drcc-overlay"
            }
          },
          "showingMatcher": {
            "type": "css",
            "target": {
              "selector": "#drcc-overlay",
              "displayFilter": true
            }
          }
        }
      ],
      "methods": [
        {
          "action": {
            "type": "hide",
            "target": {
              "selector": "#drcc-overlay"
            }
          },
          "name": "HIDE_CMP"
        },
        {
          "action": {
            "type": "waitcss",
            "target": {
              "selector": "div.drcc-cookie-categories"
            },
            "retries": "10",
            "waitTime": "250"
          },
          "name": "OPEN_OPTIONS"
        },
        {
          "action": {
            "type": "foreach",
            "target": {
              "selector": "div.drcc-checkbox"
            },
            "action": {
              "type": "list",
              "actions": [
                {
                  "type": "ifcss",
                  "target": {
                    "selector": "input[name=\"preferences\"]"
                  },
                  "trueAction": {
                    "type": "consent",
                    "consents": [
                      {
                        "matcher": {
                          "type": "checkbox",
                          "target": {
                            "selector": "input"
                          }
                        },
                        "toggleAction": {
                          "type": "click",
                          "target": {
                            "selector": "label"
                          }
                        },
                        "type": "A"
                      }
                    ]
                  }
                },
                {
                  "type": "ifcss",
                  "target": {
                    "selector": "input[name=\"statistics\"]"
                  },
                  "trueAction": {
                    "type": "consent",
                    "consents": [
                      {
                        "matcher": {
                          "type": "checkbox",
                          "target": {
                            "selector": "input"
                          }
                        },
                        "toggleAction": {
                          "type": "click",
                          "target": {
                            "selector": "label"
                          }
                        },
                        "type": "B"
                      }
                    ]
                  }
                },
                {
                  "type": "ifcss",
                  "target": {
                    "selector": "input[name=\"marketing\"]"
                  },
                  "trueAction": {
                    "type": "consent",
                    "consents": [
                      {
                        "matcher": {
                          "type": "checkbox",
                          "target": {
                            "selector": "input"
                          }
                        },
                        "toggleAction": {
                          "type": "click",
                          "target": {
                            "selector": "label"
                          }
                        },
                        "type": "F"
                      }
                    ]
                  }
                }
              ]
            }
          },
          "name": "DO_CONSENT"
        },
        {
          "action": {
            "type": "click",
            "target": {
              "selector": ".submitChosen"
            }
          },
          "name": "SAVE_CONSENT"
        }
      ]
    }
  }
