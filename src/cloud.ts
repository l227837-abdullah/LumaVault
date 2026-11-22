import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { getUrl, uploadData } from 'aws-amplify/storage';
import type { Schema } from '../amplify/data/resource';

type CloudOutputs = Parameters<typeof Amplify.configure>[0] & {
  custom?: { sessionApiUrl?: string };
};

const [outputs] = Object.values(
  import.meta.glob<CloudOutputs>('../amplify_outputs.json', {
    eager: true,
    import: 'default',
  }),
);

export const cloudReady = Boolean(outputs);
if (outputs) Amplify.configure(outputs);

const data = () => generateClient<Schema>({ authMode: 'userPool' });
const photoPath =
  (id: string) =>
  ({ identityId }: { identityId?: string }) => {
    if (!identityId) throw new Error('A signed-in storage identity is required.');
    return `photos/${identityId}/${id}`;
  };

export type Photo = Schema['Photo']['type'];
export type SessionDetails = { groups: string[]; requestId: string };

export async function readSession(): Promise<SessionDetails> {
  const endpoint = outputs?.custom?.sessionApiUrl;
  const { tokens } = await fetchAuthSession();
  if (!endpoint || !tokens?.idToken) throw new Error('The session API is unavailable.');

  const response = await fetch(new URL('session', endpoint), {
    headers: { Authorization: tokens.idToken.toString() },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`The session API returned ${response.status}.`);
  return response.json();
}

export async function listPhotos(nextToken?: string) {
  const result = await data().models.Photo.list({ limit: 25, nextToken });
  if (result.errors?.length) throw new Error(result.errors[0].message);
  return result;
}

export async function savePhoto(id: string, file: File, caption: string): Promise<Photo> {
  const photos = data().models.Photo;
  const previous = await photos.get({ id });
  if (previous.errors?.length) throw new Error(previous.errors[0].message);
  if (previous.data) return previous.data;

  await uploadData({ path: photoPath(id), data: file, options: { contentType: file.type } }).result;
  const result = await photos.create({ id, caption });
  if (!result.data || result.errors?.length) {
    throw new Error(result.errors?.[0].message ?? 'The caption could not be saved.');
  }
  return result.data;
}

export async function imageUrl(id: string) {
  const { url } = await getUrl({ path: photoPath(id), options: { expiresIn: 900 } });
  return url.href;
}
