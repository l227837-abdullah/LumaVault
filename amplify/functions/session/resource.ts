import { defineFunction } from '@aws-amplify/backend';

export const session = defineFunction({
  name: 'photo-session',
  runtime: 22,
  timeoutSeconds: 5,
  logging: { retention: '1 week' },
});
