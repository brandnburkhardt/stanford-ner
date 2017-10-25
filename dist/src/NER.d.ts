/**
 * Options for the NER
 */
export interface NEROptions {
    /**
     * Absolute path to the Stanford NER directory.
     * Default: The folder bundled in the NPM
     */
    installPath: string;
    /**
     * The jar file for Stanford NER
     * Default: stanford-ner.jar
     */
    jar: string;
    /**
     * The classifier to use
     * Default: english.all.3class.distsim.crf.ser.gz
     */
    classifier: string;
}
/**
 * Wraps the Stanford NER and provides interfaces for classifiecation
 */
export declare class NER {
    /**
     * The options object with defaults set
     */
    private options;
    /**
     * The child process through which we will interact with the underlying NER implementation
     */
    private childProcess;
    /**
     * Checks that all paths to the required files can be resolved
     */
    private checkPaths();
    /**
     * Spawns the Stanford NER as a Java process
     */
    private spawnProcess();
    /**
     * Constructor
     * @param {string} installPath (Optional) Relative or absolute path to the Stanford NER directory. Default: ./stanford-ner-2015-12-09
     * @param {string} jar (Optional) The jar file for Stanford NER. Default: stanford-ner.jar
     * @param {string} classifier (Optional) The classifier to use. Default: english.all.3class.distsim.crf.ser.gz
     */
    constructor(installPath?: string, jar?: string, classifier?: string);
    /**
     * Parses the tagged output from the NER into a Javascript object.
     * Adapted from: https://github.com/26medias/node-ner/blob/master/node-ner.js
     */
    private parse;
    /**
     * Gets the token count of a piece of text ignoring single character tokens
     * @param {string} text The text to token count
     * @param {boolean} isTagged (Optional) Whether the text is tagged
     */
    private getTokenCount(text, isTagged?);
    /**
     * Whether an entity is currently being extracted
     */
    private isBusy;
    private finishedEmitter;
    private queue;
    private extract(text, resolve);
    /**
     * Returns an array (one row per sentence) that has a Map from a Named Entity to an array containing all entities in the sentence that were classified as that Named Entity type.
     * @param {string} text The text to be processed. Should not contain any new line characters.
     */
    getEntities(text: string): Promise<Map<string, string[]>[]>;
    /**
     * Kills the Java process
     */
    exit(): void;
}
