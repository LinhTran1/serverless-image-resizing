"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({
  signatureVersion: "v4"
});

const Sharp = require("sharp");

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const CONFIGURATION_BUCKET = process.env.CONF_BUCKET;
const CONFIGURATION_FILE = process.env.CONF_FILE;

exports.handler = function(event, context, callback) {
  if (!event.queryStringParameters) {
    callback(new Error("Has no parameters in query string"));
    return;
  }
  const key = event.queryStringParameters.key;
  const match = key.match(/(\d+)x(\d+)\/(.*)/);
  if (!match || match.length < 3) {
    callback(new Error("Lacking of parameters"));
    return;
  }
  const widthParam = parseInt(match[1], 10);
  const heightParam = parseInt(match[2], 10);
  const originalKey = match[3];

  if (widthParam === 0 || heightParam === 0) {
    callback(new Error("Width and Height must be larger than 0"));
    return;
  }

  var responseContentType = undefined;

  S3.getObject({ Bucket: CONFIGURATION_BUCKET, Key: CONFIGURATION_FILE })
    .promise()
    .then(data => {
      //READ CONFIGURATION FILE
      try {
        var config = JSON.parse(data.Body);

        //Compare width & height parameters with supported dimension from config
        //Use largest dimension in dimensions are larger than width & height parameters
        var largestDimension = {
          width: widthParam,
          height: heightParam
        };
        for (var dimension of config.supportedDimensions) {
          if (
            dimension.width > largestDimension.width &&
            dimension.height > largestDimension.height
          ) {
            largestDimension.width = dimension.width;
            largestDimension.height = dimension.height;
          }
        }
        widthParam = largestDimension.width;
        heightParam = largestDimension.height;
      } catch (error) {
        callback(error);
      }
    })
    .then(() => {
      //READ IMAGE FILE
      S3.getObject({ Bucket: BUCKET, Key: originalKey })
        .promise()
        .then(data => {
          if (!data || !data.Body || !data.ContentType) {
            throw new Error("Data object is invalid");
          }

          if (data.ContentType.indexOf("image/") !== 0) {
            throw new Error("Data is not an image");
          }

          responseContentType = data.ContentType;
          var imageFormat = data.ContentType.replace("image/", "");

          //RESIZE IMAGE
          Sharp(data.Body)
            .resize(widthParam, heightParam)
            .toFormat(imageFormat)
            .toBuffer();
        })
        .then(buffer =>
          //STORE RESIZED IMAGE
          S3.putObject({
            Body: buffer,
            Bucket: BUCKET,
            ContentType: responseContentType,
            Key: key
          }).promise()
        )
        .then(() =>
          //RETURN IMAGE URL TO CLIENT
          callback(null, {
            statusCode: "301",
            headers: { location: `${URL}/${key}` },
            body: ""
          })
        )
        .catch(err => callback(err));
    })
    .catch(err => callback(err));
};
