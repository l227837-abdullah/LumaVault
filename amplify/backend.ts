import { defineBackend } from '@aws-amplify/backend';
import { Stack } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CfnAuthorizer,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  ResponseType,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { CfnUserPoolGroup } from 'aws-cdk-lib/aws-cognito';
import { ADMIN_GROUP, DEFAULT_GROUP } from './auth/groups';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { session } from './functions/session/resource';
import { storage } from './storage/resource';

export const backend = defineBackend({ auth, data, session, storage });
const { userPool, userPoolClient, cfnResources } = backend.auth.resources;
const authStack = Stack.of(userPool);
cfnResources.cfnUserPool.userPoolTier = 'LITE';
cfnResources.cfnIdentityPool.allowUnauthenticatedIdentities = false;

// Use user-pool groups without IAM role overrides so S3 keeps its per-identity policy.
for (const groupName of [DEFAULT_GROUP, ADMIN_GROUP]) {
  new CfnUserPoolGroup(authStack, `${groupName}Group`, {
    userPoolId: userPool.userPoolId,
    groupName,
  });
}

const apiStack = backend.createStack('PhotoSessionApi');
const api = new RestApi(apiStack, 'SessionApi', {
  restApiName: 'Luma Vault Session',
  cloudWatchRole: false,
  deployOptions: { stageName: 'v1', throttlingRateLimit: 5, throttlingBurstLimit: 10 },
  defaultCorsPreflightOptions: { allowOrigins: Cors.ALL_ORIGINS, allowMethods: ['GET'] },
});

const authorizer = new CognitoUserPoolsAuthorizer(apiStack, 'SessionAuthorizer', {
  cognitoUserPools: [userPool],
});

api.root
  .addResource('session')
  .addMethod('GET', new LambdaIntegration(backend.session.resources.lambda), {
    authorizer,
    authorizationType: AuthorizationType.COGNITO,
  });

const cfnAuthorizer = authorizer.node.defaultChild as CfnAuthorizer;
cfnAuthorizer.identityValidationExpression = `^${userPoolClient.userPoolClientId}$`;

for (const [name, type] of [
  ['ClientErrorCors', ResponseType.DEFAULT_4XX],
  ['ServerErrorCors', ResponseType.DEFAULT_5XX],
] as const) {
  api.addGatewayResponse(name, {
    type,
    responseHeaders: { 'Access-Control-Allow-Origin': "'*'" },
  });
}

backend.addOutput({ custom: { sessionApiUrl: api.url } });
