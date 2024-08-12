"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveToS3 = exports.copyS3Folder = exports.fetchS3Folder = void 0;
const aws_sdk_1 = require("aws-sdk");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const s3 = new aws_sdk_1.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT
});
const fetchS3Folder = (key, localPath) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const params = {
            Bucket: (_a = process.env.S3_BUCKET) !== null && _a !== void 0 ? _a : "",
            Prefix: key
        };
        const response = yield s3.listObjectsV2(params).promise();
        if (response.Contents) {
            // Use Promise.all to run getObject operations in parallel
            yield Promise.all(response.Contents.map((file) => __awaiter(void 0, void 0, void 0, function* () {
                var _b;
                const fileKey = file.Key;
                if (fileKey) {
                    const getObjectParams = {
                        Bucket: (_b = process.env.S3_BUCKET) !== null && _b !== void 0 ? _b : "",
                        Key: fileKey
                    };
                    const data = yield s3.getObject(getObjectParams).promise();
                    if (data.Body) {
                        const fileData = data.Body;
                        const filePath = path_1.default.join(localPath, fileKey.replace(key, ""));
                        yield writeFile(filePath, fileData);
                        console.log(`Downloaded ${fileKey} to ${filePath}`);
                    }
                }
            })));
        }
    }
    catch (error) {
        console.error('Error fetching folder:', error);
    }
});
exports.fetchS3Folder = fetchS3Folder;
function copyS3Folder(sourcePrefix, destinationPrefix, continuationToken) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const listParams = {
                Bucket: (_a = process.env.S3_BUCKET) !== null && _a !== void 0 ? _a : "",
                Prefix: sourcePrefix,
                ContinuationToken: continuationToken
            };
            const listedObjects = yield s3.listObjectsV2(listParams).promise();
            if (!listedObjects.Contents || listedObjects.Contents.length === 0)
                return;
            yield Promise.all(listedObjects.Contents.map((object) => __awaiter(this, void 0, void 0, function* () {
                var _b;
                if (!object.Key)
                    return;
                const destinationKey = object.Key.replace(sourcePrefix, destinationPrefix);
                const copyParams = {
                    Bucket: (_b = process.env.S3_BUCKET) !== null && _b !== void 0 ? _b : "",
                    CopySource: `${process.env.S3_BUCKET}/${object.Key}`,
                    Key: destinationKey
                };
                console.log(copyParams);
                yield s3.copyObject(copyParams).promise();
                console.log(`Copied ${object.Key} to ${destinationKey}`);
            })));
            if (listedObjects.IsTruncated) {
                yield copyS3Folder(sourcePrefix, destinationPrefix, listedObjects.NextContinuationToken);
            }
        }
        catch (error) {
            console.error('Error copying folder:', error);
        }
    });
}
exports.copyS3Folder = copyS3Folder;
function writeFile(filePath, fileData) {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        try {
            yield createFolder(path_1.default.dirname(filePath));
            fs_1.default.writeFile(filePath, fileData, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        }
        catch (err) {
            reject(err);
        }
    }));
}
function createFolder(dirName) {
    return new Promise((resolve, reject) => {
        fs_1.default.mkdir(dirName, { recursive: true }, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
const saveToS3 = (key, filePath, content) => __awaiter(void 0, void 0, void 0, function* () {
    var _c;
    const params = {
        Bucket: (_c = process.env.S3_BUCKET) !== null && _c !== void 0 ? _c : "",
        Key: `${key}${filePath}`,
        Body: content
    };
    yield s3.putObject(params).promise();
});
exports.saveToS3 = saveToS3;
