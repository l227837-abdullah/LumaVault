import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

const schema = a.schema({
  Photo: a
    .model({
      caption: a.string().required(),
    })
    .authorization((allow) => [allow.owner().to(['create', 'read'])]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
