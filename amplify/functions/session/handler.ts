import type { APIGatewayProxyHandler } from 'aws-lambda';

function groupsFromClaim(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.filter((group) => typeof group === 'string');
  if (typeof claim !== 'string') return [];
  return claim
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((group) => group.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const claims = event.requestContext.authorizer?.claims;
  const requestId = event.requestContext.requestId;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };

  if (!claims?.sub) {
    return { statusCode: 401, headers, body: JSON.stringify({ message: 'Sign in required' }) };
  }

  const groups = groupsFromClaim(claims['cognito:groups']);
  console.log(JSON.stringify({ event: 'session_requested', requestId, groupCount: groups.length }));
  return { statusCode: 200, headers, body: JSON.stringify({ groups, requestId }) };
};
