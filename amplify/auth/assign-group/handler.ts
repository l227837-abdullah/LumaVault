import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { PostConfirmationTriggerEvent, PreTokenGenerationTriggerEvent } from 'aws-lambda';
import { DEFAULT_GROUP } from '../groups';

const cognito = new CognitoIdentityProviderClient({ maxAttempts: 2 });
type GroupEvent = PostConfirmationTriggerEvent | PreTokenGenerationTriggerEvent;

export async function handler(event: GroupEvent) {
  const isHostedSignIn = event.triggerSource === 'TokenGeneration_HostedAuth';
  const existingGroups = isHostedSignIn ? event.request.groupConfiguration.groupsToOverride : [];
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp' && !isHostedSignIn) return event;
  if (existingGroups?.includes(DEFAULT_GROUP)) return event;

  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: DEFAULT_GROUP,
    }),
  );

  if (isHostedSignIn) {
    // Cognito may already have taken the group snapshot for this first token.
    const { iamRolesToOverride, preferredRole } = event.request.groupConfiguration;
    event.response.claimsOverrideDetails = {
      groupOverrideDetails: {
        groupsToOverride: [...(existingGroups ?? []), DEFAULT_GROUP],
        ...(iamRolesToOverride?.length ? { iamRolesToOverride } : {}),
        ...(preferredRole ? { preferredRole } : {}),
      },
    };
  }

  console.log(
    JSON.stringify({
      event: 'default_group_assigned',
      group: DEFAULT_GROUP,
      trigger: event.triggerSource,
    }),
  );
  return event;
}
