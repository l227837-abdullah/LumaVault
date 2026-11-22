import { defineAuth, secret } from '@aws-amplify/backend';
import { assignGroup } from './assign-group/resource';

const localOrigin = 'http://localhost:5173';
const { APP_ORIGIN, AWS_APP_ID, AWS_BRANCH } = process.env;
const branchOrigin =
  AWS_APP_ID && AWS_BRANCH ? `https://${AWS_BRANCH}.${AWS_APP_ID}.amplifyapp.com` : undefined;
const appOrigin = APP_ORIGIN ? new URL(APP_ORIGIN).origin : branchOrigin;
const redirectUrls = [
  ...new Set([localOrigin, appOrigin].filter((origin) => origin !== undefined)),
].map((origin) => `${origin}/`);

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        scopes: ['openid', 'email', 'profile'],
      },
      callbackUrls: redirectUrls,
      logoutUrls: redirectUrls,
    },
  },
  triggers: {
    postConfirmation: assignGroup,
    preTokenGeneration: assignGroup,
  },
  access: (allow) => [allow.resource(assignGroup).to(['addUserToGroup'])],
});
