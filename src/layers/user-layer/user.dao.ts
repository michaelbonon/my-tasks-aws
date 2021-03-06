import { AWSError } from "aws-sdk";
import { DocumentClient } from "aws-sdk/lib/dynamodb/document_client";
import { PromiseResult } from "aws-sdk/lib/request";
import {
  dynamoClient,
  TABLE_NAME,
  EMAIL_INDEX,
} from "/opt/nodejs/dynamo.config";
import { User, UserDetails } from "./user.model";
import { isAWSError } from "/opt/nodejs/util";
import {
  EnvironmentConfigError,
  RequiredPropertyMissingError,
  UsernameUnavailableError,
  UserNotFoundError,
} from "/opt/nodejs/errors";

export const create = async (user: UserDetails): Promise<string> => {
  if (!TABLE_NAME) throw new EnvironmentConfigError("TABLE_NAME");

  const params = {
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${user.id}`,
      SK: `USER#${user.id}`,
      ...user,
    },
    ConditionExpression: "attribute_not_exists(PK)",
  };

  try {
    await dynamoClient.put(params).promise();
    return user.id;
  } catch (error) {
    if (isAWSError(error) && error.code === "ConditionalCheckFailedException") {
      console.error(error);
      throw new UsernameUnavailableError();
    }
    throw error;
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  if (!TABLE_NAME) throw new EnvironmentConfigError("TABLE_NAME");

  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${id}`,
      SK: `USER#${id}`,
    },
    ConditionExpression: "attribute_exists(PK)",
  };

  try {
    await dynamoClient.delete(params).promise();
  } catch (error) {
    console.log("hello world");
    if (isAWSError(error) && error.code === "ConditionalCheckFailedException") {
      console.error(error);
      throw new UserNotFoundError();
    }
    throw error;
  }
};

export const patch = async (
  userPartial: Partial<User>
): Promise<PromiseResult<DocumentClient.UpdateItemOutput, AWSError>> => {
  if (!TABLE_NAME) throw new EnvironmentConfigError("TABLE_NAME");
  if (!userPartial.id) throw new RequiredPropertyMissingError("id");

  let updateExpression = "set";
  const expressionAttributeValues: {
    ":f"?: string;
    ":n"?: string;
    ":d"?: string;
  } = {};

  if (userPartial.fullName) {
    updateExpression += " fullName = :f,";
    expressionAttributeValues[":f"] = userPartial.fullName;
  }
  if (userPartial.nickname) {
    updateExpression += " nickname = :n,";
    expressionAttributeValues[":n"] = userPartial.nickname;
  }
  if (userPartial.preferences?.defaultListId) {
    updateExpression += " preferences.defaultListId = :d,";
    expressionAttributeValues[":d"] = userPartial.preferences.defaultListId;
  }
  updateExpression = updateExpression.slice(0, -1);

  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userPartial.id}`,
      SK: `USER#${userPartial.id}`,
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ConditionExpression: "attribute_exists(PK)",
  };

  try {
    return await dynamoClient.update(params).promise();
  } catch (error) {
    if (isAWSError(error) && error.code === "ConditionalCheckFailedException") {
      console.error(error);
      throw new UserNotFoundError();
    }
    throw error;
  }
};

export const get = async (
  id: string
): Promise<DocumentClient.AttributeMap | undefined> => {
  if (!TABLE_NAME) throw new EnvironmentConfigError("TABLE_NAME");

  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${id}`,
      SK: `USER#${id}`,
    },
    ProjectionExpression:
      "id, email, nickname, fullName, #hash, salt, preferences",
    ExpressionAttributeNames: {
      "#hash": "hash",
    },
  };

  const data = await dynamoClient.get(params).promise();
  return data.Item;
};

export const getByEmail = async (
  email: string
): Promise<DocumentClient.AttributeMap | undefined> => {
  if (!TABLE_NAME) throw new EnvironmentConfigError("TABLE_NAME");
  if (!EMAIL_INDEX) throw new EnvironmentConfigError("EMAIL_INDEX");

  const params = {
    TableName: TABLE_NAME,
    IndexName: EMAIL_INDEX,
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: {
      ":email": email,
    },
    Limit: 1,
  };

  const data = await dynamoClient.query(params).promise();
  return data.Items ? data.Items[0] : undefined;
};
