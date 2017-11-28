"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const childProcess = require("child_process");
const path = require("path");
const fs = require("fs");
const _ = require("lodash");
const FileNotFoundError_1 = require("./FileNotFoundError");
const natural = require("natural");
const events = require("events");
const uuid = require("node-uuid");
/**
 * Wraps the Stanford NER and provides interfaces for classifiecation
 */
class NER {
    /**
     * Constructor
     * @param {string} installPath (Optional) Relative or absolute path to the Stanford NER directory. Default: ./stanford-ner-2015-12-09
     * @param {string} jar (Optional) The jar file for Stanford NER. Default: stanford-ner.jar
     * @param {string} classifier (Optional) The classifier to use. Default: english.all.3class.distsim.crf.ser.gz
     * @param {number} javaHeapSize (Optional) The amount of memory (in MB) to allocate to the Java process' heap. Default: 1500
     */
    constructor(installPath, jar, classifier, javaHeapSize) {
        /**
         * The options object with defaults set
         */
        this.options = {
            //This script compiles to ./dist/src hence ../../stanford-ner-2015-12-09
            installPath: path.join(__dirname, "../../stanford-ner-2017-06-09"),
            jar: "stanford-ner.jar",
            classifier: "english.muc.7class.distsim.crf.ser.gz",
            javaHeapSize: 1500
        };
        /**
         * Parses the tagged output from the NER into a Javascript object.
         * Adapted from: https://github.com/26medias/node-ner/blob/master/node-ner.js
         */
        this.parse = function (parsed) {
            const tokenized = parsed.split(/\s/gmi);
            const splitRegex = new RegExp('(.+)/([A-Z]+)', 'g');
            let tagged = _.map(tokenized, function (token) {
                const parts = new RegExp('(.+)/([A-Z]+)', 'g').exec(token);
                if (parts) {
                    return {
                        w: parts[1],
                        t: parts[2]
                    };
                }
                return null;
            });
            tagged = _.compact(tagged);
            // Now we extract the neighbors into one entity
            const entities = new Map();
            const l = tagged.length;
            let prevEntity = undefined;
            let entityBuffer = [];
            for (let i = 0; i < l; i++) {
                if (tagged[i].t != 'O') {
                    if (tagged[i].t != prevEntity) {
                        // New tag!
                        // Was there a buffer?
                        if (entityBuffer.length > 0) {
                            // There was! We save the entity
                            if (!entities.get(prevEntity)) {
                                entities.set(prevEntity, []);
                            }
                            entities.get(prevEntity).push(entityBuffer.join(' '));
                            // Now we set the buffer
                            entityBuffer = [];
                        }
                        // Push to the buffer
                        entityBuffer.push(tagged[i].w);
                    }
                    else {
                        // Prev entity is same a current one. We push to the buffer.
                        entityBuffer.push(tagged[i].w);
                    }
                }
                else {
                    if (entityBuffer.length > 0) {
                        // There was! We save the entity
                        if (!entities.get(prevEntity)) {
                            entities.set(prevEntity, []);
                        }
                        entities.get(prevEntity).push(entityBuffer.join(' '));
                        // Now we set the buffer
                        entityBuffer = [];
                    }
                }
                // Save the current entity
                prevEntity = tagged[i].t;
            }
            //If entity buffer is not empty, then add the last entries
            if (entityBuffer.length) {
                entities.set(prevEntity, entityBuffer);
            }
            return entities;
        };
        /**
         * Whether an entity is currently being extracted
         */
        this.isBusy = false;
        this.finishedEmitter = new events.EventEmitter();
        this.queue = [];
        if (installPath) {
            installPath = installPath.trim();
            this.options.installPath = installPath;
        }
        if (jar) {
            jar = jar.trim();
            this.options.jar = jar;
        }
        if (classifier) {
            classifier = classifier.trim();
            this.options.classifier = classifier;
        }
        if (Number.isFinite(javaHeapSize) && javaHeapSize >= 0) {
            this.options.javaHeapSize = javaHeapSize;
        }
        this.checkPaths();
        this.spawnProcess();
    }
    /**
     * Checks that all paths to the required files can be resolved
     */
    checkPaths() {
        const classifierPath = path.normalize(path.join(this.options.installPath, "classifiers", this.options.classifier));
        if (!fs.existsSync(classifierPath)) {
            throw new FileNotFoundError_1.FileNotFoundError("Classifier could not be found at path:" + classifierPath);
        }
        const jarPath = path.normalize(path.join(this.options.installPath, this.options.jar));
        if (!fs.existsSync(jarPath)) {
            throw new FileNotFoundError_1.FileNotFoundError("NER Jar could not be found at path:" + jarPath);
        }
    }
    /**
     * Spawns the Stanford NER as a Java process
     */
    spawnProcess() {
        const isWin = /^win/.test(process.platform);
        this.childProcess = childProcess.spawn("java", [
            "-mx" + this.javaHeapSize + "m",
            "-cp",
            path.normalize(path.join(this.options.installPath, this.options.jar)) +
                (isWin ? ";" : ":") + path.normalize(path.join(this.options.installPath, "/lib/*")),
            "edu.stanford.nlp.ie.crf.CRFClassifier",
            "-loadClassifier",
            path.normalize(path.join(this.options.installPath, "classifiers", this.options.classifier)),
            "-readStdin"
        ]);
        this.childProcess.stdout.setEncoding("utf8");
        /**
         * Kill the child process on Control + C
         */
        process.on('SIGINT', () => {
            this.childProcess.kill();
        });
        /**
         * Kill the child process on SIGTERM
         */
        process.on('SIGTERM', () => {
            this.childProcess.kill();
        });
    }
    /**
     * Gets the token count of a piece of text ignoring single character tokens
     * @param {string} text The text to token count
     * @param {boolean} isTagged (Optional) Whether the text is tagged
     */
    getTokenCount(text, isTagged) {
        const tokenizer = new natural.TreebankWordTokenizer();
        let textTokens;
        if (isTagged) {
            textTokens = text.split(" ");
            textTokens = textTokens.map((val) => {
                const parts = val.split("/");
                if (parts[0] === "``") {
                    return "'";
                }
                if (parts[0] === "\'\'") {
                    return "'";
                }
                if (parts[0] === "-LRB-") {
                    return "(";
                }
                if (parts[0] === "-RRB-") {
                    return ")";
                }
                if (parts[0] === "-LSB-") {
                    return "[";
                }
                if (parts[0] === "-RSB-") {
                    return "]";
                }
                if (parts[0] === "-LCB-") {
                    return "{";
                }
                if (parts[0] === "-RCB-") {
                    return "}";
                }
                return parts[0];
            });
        }
        else {
            textTokens = tokenizer.tokenize(text);
        }
        const filtered = textTokens.filter((value) => {
            if (isTagged) {
                const parts = value.split("/");
                value = parts[0].trim();
            }
            if (value.length > 1) {
                return true;
            }
            return false;
        });
        return filtered.length;
    }
    extract(text, resolve) {
        let numTokens = this.getTokenCount(text);
        const result = [];
        this.childProcess.stdout.on("data", (data) => {
            data = data.trim();
            const sentences = data.split("\n");
            sentences.forEach((sentence) => {
                numTokens -= this.getTokenCount(sentence, true);
                const parsed = this.parse(sentence);
                result.push(parsed);
                if (numTokens <= 0) {
                    this.childProcess.stdout.removeAllListeners();
                    this.isBusy = false;
                    resolve(result);
                    if (this.queue.length) {
                        const nextEvent = this.queue.shift();
                        this.finishedEmitter.emit(nextEvent);
                    }
                }
            });
        });
        //Remove any CR+LF from the text.
        text = text.trim();
        //Then add one last one
        text += "\n";
        this.childProcess.stdin.write(text);
    }
    /**
     * Returns an array (one row per sentence) that has a Map from a Named Entity to an array containing all entities in the sentence that were classified as that Named Entity type.
     * @param {string} text The text to be processed. Should not contain any new line characters.
     */
    getEntities(text) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isBusy) {
                const requestId = uuid.v4();
                this.queue.push(requestId);
                return new Promise((resolve, reject) => {
                    this.finishedEmitter.on(requestId, () => {
                        this.isBusy = true;
                        this.extract(text, resolve);
                    });
                });
            }
            else {
                this.isBusy = true;
                return new Promise((resolve, reject) => {
                    this.extract(text, resolve);
                })
            }
        });
    }
    /**
     * Kills the Java process
     */
    exit() {
        this.childProcess.kill();
    }
}
exports.NER = NER;
//# sourceMappingURL=NER.js.map
