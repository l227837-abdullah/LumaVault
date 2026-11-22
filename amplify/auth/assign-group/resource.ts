import { defineFunction } from '@aws-amplify/backend';

export const assignGroup = defineFunction({
  name: 'assign-default-group',
  resourceGroupName: 'auth',
  runtime: 22,
  timeoutSeconds: 5,
  logging: { retention: '1 week' },
});
