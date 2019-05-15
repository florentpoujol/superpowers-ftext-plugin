"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const OT = require("operational-transform");
const fs = require("fs");
const path = require("path");
class FTextAsset extends SupCore.Data.Base.Asset {
    // called from the editor onAssetReceived() as well as on server startup
    constructor(id, pub, server) {
        super(id, pub, FTextAsset.schema, server);
    }
    // called on asset creation
    // options contain the asset's name
    init(options, callback) {
        let defaultContent = "";
        this.pub = {
            text: defaultContent,
            draft: defaultContent,
            revisionId: 0,
        };
        super.init(options, callback);
    }
    setup() {
        this.document = new OT.Document(this.pub.draft, this.pub.revisionId);
        this.hasDraft = this.pub.text !== this.pub.draft;
    }
    restore() {
        if (this.hasDraft)
            this.emit("setBadge", "draft", "info");
    }
    destroy(callback) {
        callback();
    }
    // called on server startup
    load(assetPath) {
        // NOTE: We must not set this.pub with temporary values here, otherwise
        // the asset will be considered loaded by Dictionary.acquire
        // and the acquire callback will be called immediately
        fs.readFile(path.join(assetPath, "ftext.txt"), { encoding: "utf8" }, (err, text) => {
            fs.readFile(path.join(assetPath, "draft.txt"), { encoding: "utf8" }, (err, draft) => {
                let pub = { revisionId: 0, text, draft: (draft != null) ? draft : text };
                // this.setup();
                // this.emit("load");
                this._onLoaded(assetPath, pub);
            });
        });
    }
    // called when it is time to write the asset on disk, not when the user save the asset from the editor
    save(outputPath, callback) {
        this.write(fs.writeFile, outputPath, (err) => {
            if (err != null) {
                callback(err);
                return;
            }
            if (this.hasDraft) {
                fs.writeFile(path.join(outputPath, "draft.txt"), this.pub.draft, { encoding: "utf8" }, callback);
            }
            else {
                // delete the draft.txt file if there is no draft to save and the file exists
                fs.unlink(path.join(outputPath, "draft.txt"), (err) => {
                    if (err != null && err.code !== "ENOENT") {
                        callback(err);
                        return;
                    }
                    callback(null);
                });
            }
        });
    }
    clientExport(outputPath, callback) {
        this.write(SupApp.writeFile, outputPath, callback);
    }
    write(writeFile, outputPath, callback) {
        writeFile(path.join(outputPath, "ftext.txt"), this.pub.text, { encoding: "utf8" }, callback);
    }
    server_editText(client, operationData, revisionIndex, callback) {
        if (operationData.userId !== client.id) {
            callback("Invalid client id");
            return;
        }
        let operation = new OT.TextOperation();
        if (!operation.deserialize(operationData)) {
            callback("Invalid operation data");
            return;
        }
        try {
            operation = this.document.apply(operation, revisionIndex);
        }
        catch (err) {
            callback("Operation can't be applied");
            return;
        }
        this.pub.draft = this.document.text;
        this.pub.revisionId++;
        callback(null, null, operation.serialize(), this.document.getRevisionId() - 1);
        if (!this.hasDraft) {
            this.hasDraft = true;
            this.emit("setBadge", "draft", "info");
        }
        this.emit("change");
    }
    client_editText(operationData, revisionIndex) {
        let operation = new OT.TextOperation();
        operation.deserialize(operationData);
        this.document.apply(operation, revisionIndex);
        this.pub.draft = this.document.text;
        this.pub.revisionId++;
    }
    server_applyDraftChanges(client, options, callback) {
        this.pub.text = this.pub.draft;
        callback(null);
        if (this.hasDraft) {
            this.hasDraft = false;
            this.emit("clearBadge", "draft");
        }
        this.emit("change");
    }
    client_applyDraftChanges() { this.pub.text = this.pub.draft; }
    client_unload() { return; } // called when an asset is trashed
}
FTextAsset.schema = {
    text: { type: "string" },
    draft: { type: "string" },
    revisionId: { type: "integer" },
};
exports.default = FTextAsset;
