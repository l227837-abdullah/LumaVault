import { getCurrentUser, signInWithRedirect, signOut, type AuthUser } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { useEffect, useState, type FormEvent } from 'react';
import {
  cloudReady,
  imageUrl,
  listPhotos,
  readSession,
  savePhoto,
  type Photo,
  type SessionDetails,
} from './cloud';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Please try again.';

type Draft = { id: string; file: File };

function PhotoCard({ photo }: { photo: Photo }) {
  const [image, setImage] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void imageUrl(photo.id).then(
      (url) => {
        if (current) setImage(url);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [photo.id, attempt]);

  return (
    <article className="photo-card">
      <div className="photo-frame">
        {failed ? (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setFailed(false);
              setImage(undefined);
              setAttempt((value) => value + 1);
            }}
          >
            Retry image
          </button>
        ) : image ? (
          <img src={image} alt={photo.caption} loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <span>Loading image…</span>
        )}
      </div>
      <div className="photo-label">
        <h3>{photo.caption}</h3>
        <time dateTime={photo.createdAt}>
          {new Date(photo.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </time>
      </div>
    </article>
  );
}

function AccountPanel() {
  const [details, setDetails] = useState<SessionDetails>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let active = true;
    void readSession()
      .then(
        (result) => {
          if (active) setDetails(result);
        },
        (reason) => {
          if (active) setError(errorText(reason));
        },
      )
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    setPending(true);
    setError('');
    try {
      setDetails(await readSession());
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel session-panel" aria-labelledby="session-title">
      <h2 id="session-title">Account session</h2>
      <div aria-live="polite">
        {pending ? (
          <p>Checking session…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          details && (
            <dl>
              <div>
                <dt>Cognito groups</dt>
                <dd>{details.groups.join(', ') || 'None'}</dd>
              </div>
              <div>
                <dt>API request ID</dt>
                <dd className="request-id">{details.requestId}</dd>
              </div>
            </dl>
          )
        )}
      </div>
      <button type="button" className="quiet" disabled={pending} onClick={() => void refresh()}>
        Check session
      </button>
    </section>
  );
}

function Gallery() {
  const [draft, setDraft] = useState<Draft>();
  const [caption, setCaption] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [nextToken, setNextToken] = useState<string | null>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [galleryError, setGalleryError] = useState('');
  const [status, setStatus] = useState('');

  function mergePhotos(incoming: Photo[]) {
    setPhotos((previous) => {
      const byId = new Map(previous.map((photo) => [photo.id, photo]));
      for (const photo of incoming) byId.set(photo.id, photo);
      return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  useEffect(() => {
    let active = true;
    void listPhotos()
      .then(
        (result) => {
          if (active) {
            mergePhotos(result.data);
            setNextToken(result.nextToken);
          }
        },
        (error) => {
          if (active) setGalleryError(errorText(error));
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadPhotos(token?: string) {
    setLoading(true);
    setGalleryError('');
    try {
      const result = await listPhotos(token);
      mergePhotos(result.data);
      setNextToken(result.nextToken);
    } catch (error) {
      setGalleryError(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  function selectFile(file?: File) {
    setFormError('');
    setStatus('');
    setDraft(undefined);
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_BYTES || file.size === 0) {
      setFormError('Choose a JPEG, PNG, WebP or GIF image between 1 byte and 5 MB.');
      return;
    }
    setDraft({ id: crypto.randomUUID(), file });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !caption.trim() || saving) return;
    const form = event.currentTarget;
    setSaving(true);
    setFormError('');
    setStatus('');
    try {
      const photo = await savePhoto(draft.id, draft.file, caption.trim());
      mergePhotos([photo]);
      setDraft(undefined);
      setCaption('');
      form.reset();
      setStatus('Photo added to your journal.');
    } catch (error) {
      setFormError(`${errorText(error)} You can retry with the same file.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="workspace">
      <div className="workspace-heading">
        <h1>Your photo journal</h1>
        <p>Photos and captions are visible to your account.</p>
      </div>
      <div className="workspace-grid">
        <aside>
          <section className="panel" aria-labelledby="upload-title">
            <h2 id="upload-title">Add a photo</h2>
            <form onSubmit={(event) => void submit(event)}>
              <fieldset disabled={saving}>
                <label htmlFor="image-file">Image</label>
                <input
                  id="image-file"
                  type="file"
                  accept={IMAGE_TYPES.join(',')}
                  required
                  onChange={(event) => selectFile(event.currentTarget.files?.[0])}
                  aria-describedby="image-help"
                />
                <small id="image-help">JPEG, PNG, WebP or GIF. Up to 5 MB.</small>
                <label htmlFor="caption">Caption</label>
                <input
                  id="caption"
                  type="text"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  maxLength={120}
                  required
                  placeholder="A few words about this photo"
                />
                <button className="primary" disabled={!draft || !caption.trim()}>
                  {saving ? 'Saving photo…' : 'Save photo'}
                </button>
              </fieldset>
              {formError && (
                <p role="alert" className="error">
                  {formError}
                </p>
              )}
              <p role="status" className="status">
                {status}
              </p>
            </form>
          </section>
          <AccountPanel />
        </aside>
        <section className="collection" aria-labelledby="photos-title">
          <h2 id="photos-title">Saved photos</h2>
          {galleryError && (
            <div className="empty">
              <p role="alert">{galleryError}</p>
              <button
                type="button"
                className="quiet"
                onClick={() => void loadPhotos(nextToken ?? undefined)}
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !galleryError && photos.length === 0 && (
            <div className="empty">
              <p>{nextToken ? 'No photos on this page.' : 'Your journal is empty.'}</p>
            </div>
          )}
          <div className="photo-grid">
            {photos.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} />
            ))}
          </div>
          {loading && <p role="status">Loading photos…</p>}
          {nextToken && !galleryError && (
            <button
              className="quiet load-more"
              type="button"
              disabled={loading}
              onClick={() => void loadPhotos(nextToken)}
            >
              Load more photos
            </button>
          )}
        </section>
      </div>
    </main>
  );
}

export function App() {
  const [user, setUser] = useState<AuthUser>();
  const [checking, setChecking] = useState(cloudReady);
  const [redirecting, setRedirecting] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!cloudReady) return;
    let active = true;
    async function refresh() {
      try {
        const current = await getCurrentUser();
        if (active) setUser(current);
      } catch {
        if (active) setUser(undefined);
      } finally {
        if (active) setChecking(false);
      }
    }
    const stop = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'signInWithRedirect') {
        setAuthError('');
        void refresh();
      } else if (payload.event === 'signedOut') {
        setUser(undefined);
      } else if (payload.event === 'signInWithRedirect_failure') {
        setAuthError(errorText(payload.data?.error));
        setRedirecting(false);
      }
    });
    void refresh();
    return () => {
      active = false;
      stop();
    };
  }, []);

  async function authenticate(google: boolean) {
    setRedirecting(true);
    setAuthError('');
    try {
      await signInWithRedirect(google ? { provider: 'Google' } : undefined);
    } catch (error) {
      setAuthError(errorText(error));
      setRedirecting(false);
    }
  }

  async function endSession() {
    setAuthError('');
    try {
      await signOut();
      setUser(undefined);
    } catch (error) {
      setAuthError(errorText(error));
    }
  }

  return (
    <>
      <header className="site-header">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" /> Luma Vault
        </span>
        {user && (
          <button type="button" className="quiet" onClick={() => void endSession()}>
            Sign out
          </button>
        )}
      </header>
      {authError && (
        <p className="auth-error error" role="alert">
          {authError}
        </p>
      )}
      {checking ? (
        <main className="waiting" role="status">
          Checking your session…
        </main>
      ) : user ? (
        <Gallery key={user.userId} />
      ) : (
        <main className="welcome">
          <div className="welcome-content">
            <h1>
              Keep your favorite
              <br /> moments close.
            </h1>
            <p>Upload photos, add a caption, and revisit them in your private journal.</p>
            {cloudReady ? (
              <div className="auth-actions">
                <button
                  className="primary"
                  type="button"
                  disabled={redirecting}
                  onClick={() => void authenticate(true)}
                >
                  {redirecting ? 'Opening sign-in…' : 'Continue with Google'}
                </button>
                <button
                  className="quiet"
                  type="button"
                  disabled={redirecting}
                  onClick={() => void authenticate(false)}
                >
                  Sign in with email
                </button>
              </div>
            ) : (
              <p className="setup-note">
                Connect the AWS backend to enable sign-in and uploads. See README.md for setup.
              </p>
            )}
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="photo-print photo-print-back" />
            <div className="photo-print photo-print-front">
              <div className="print-image" />
            </div>
          </div>
        </main>
      )}
    </>
  );
}
