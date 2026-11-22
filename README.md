# Luma Vault

Luma Vault is a private photo journal built for the BCS 9A cloud computing final project. Users sign in through Cognito, upload an image to S3 and save a caption through AppSync. The account panel calls a separate Cognito-protected REST endpoint and displays its request ID for the CloudWatch demo.

## 1. Push the project to GitHub

On Windows, extract the ZIP and open PowerShell in `luma-vault`, the folder containing `package.json`. Install [Git for Windows](https://git-scm.com/install/windows) and [Node.js 22 LTS](https://nodejs.org/en/download) if needed. Use a GitHub account you can authorize in Amplify. You can use a private repository and invite your instructor and TA as collaborators.

Create an empty repository called `luma-vault` on [GitHub](https://github.com/new). Leave the README, `.gitignore`, and license options unchecked. Replace `YOUR_GITHUB_USERNAME` in the following commands.

```powershell
npm ci
npm run lint
npm run format:check
npm run build

git init -b main
git add .
git commit -m "Build Luma Vault serverless photo journal"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/luma-vault.git
git push -u origin main
```

If PowerShell blocks `npm.ps1`, use `npm.cmd` in the commands above. If Git asks for a commit identity, set `git config user.name "Your Name"` and `git config user.email "your-github-email"` in this repository. Git may open a browser to authorize the push. Check the repository's **Actions** tab for the five jobs in **Project checks**. The workflow runs on pushes and pull requests and works in a private repository without paid code-scanning add-ons. The full dependency audit can fail on documented Amplify CLI advisories. See [dependency scan findings](docs/check-findings.md).

For a local layout preview, run `npm run dev` and open `http://localhost:5173/`. Once AWS is deployed, the local app can use the real backend via the generated `amplify_outputs.json` file. Sign-in and uploads require this file.

## 2. Create the Google OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project. Open **Google Auth Platform** and configure **Branding** and **Audience**. Choose **External** if the graders may sign in outside your Google Workspace. Use your own support and contact email.
2. In **Clients**, create an OAuth client of type **Web application**. Name it `Luma Vault` and record the client ID and client secret. You can add the Cognito redirect URI after the first successful AWS deployment, when the Cognito domain exists.
3. For testing, add your demo Google account and any grader addresses you have in **Audience → Test users** if using the Testing publishing status. This project requests only `openid`, `email`, and `profile`. Review the [Google OAuth app-state documentation](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) and test with a separate Google account before grading.

## 3. Deploy the GitHub branch through AWS Amplify

1. Sign into [AWS](https://console.aws.amazon.com/amplify/home?region=us-east-1). Use `us-east-1` for the steps below. In Billing, check that your account can use the required services and review Free Tier credits or usage limits. On an existing paid account, set a small cost alert and monitor usage. Keep one branch and use a few small demo images. Budget alerts are notifications, and charges depend on your AWS plan and usage.
2. In **AWS Amplify**, choose **Create new app → GitHub**, authorize the `luma-vault` repository, and select the `main` branch. Use the repository's `amplify.yml` build settings, Amplify Hosting, and an Amplify backend deployment service role. Select the console option to create the role if needed. It needs the `AmplifyBackendDeployFullAccess` managed policy. Confirm the connection and deployment. The first job can fail if the Google values have yet to be added.
3. In the new app, open **Hosting → Secrets → Manage secrets**. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for `main` (or all branches if prompted), with the values from Google. Enter them in **Secrets**, not in GitHub, source code, or frontend environment variables. If you use a different app domain, set `APP_ORIGIN` under **Hosting → Environment variables** to the exact HTTPS app origin. The code defaults to the Amplify branch URL, so this override is usually unnecessary.
4. In Amplify, select `main` and click **Redeploy this version** if the initial job failed or ran before secrets were configured. Wait for the deploy to succeed. Copy the `https://main.…amplifyapp.com/` URL from the branch page. Every later push to `main` should start another Amplify deployment.
5. In AWS **Cognito → User pools**, open the user pool created for the Amplify branch. In **Domain**, copy its HTTPS Cognito domain. In Google Auth Platform, edit the OAuth client. Add the Cognito origin to **Authorized JavaScript origins** and the same origin plus `/oauth2/idpresponse` to **Authorized redirect URIs**. The redirect goes to Cognito first. Save the client, then open Luma Vault and sign in with Google.

Example for Step 5, using a placeholder Cognito domain:

| Google setting               | Example                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| Authorized JavaScript origin | `https://your-pool.auth.us-east-1.amazoncognito.com`                    |
| Authorized redirect URI      | `https://your-pool.auth.us-east-1.amazoncognito.com/oauth2/idpresponse` |

For local use against the deployed backend, download `amplify_outputs.json` from the `main` branch in Amplify (look for **Download outputs file**) and save it beside `package.json`. Restart `npm run dev` and use `http://localhost:5173/`, which is an allowed callback and logout URL. The hosted site uses the outputs file generated during its build.

## 4. Run the demo and collect evidence

| Requirement               | How to demonstrate it                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google and Cognito groups | Sign in with a fresh Google account. In the app, check that **Account session** shows `Users`. In Cognito **Groups**, open `Users` and verify the new user is listed. `Admins` is a separate group that an administrator can assign in Cognito. A member of `Admins` still only sees their own journal.                                         |
| Post Confirmation trigger | On the login screen, select **Sign in with email** and create a fresh account. Confirm the email, sign in, and check the `Users` group in the app. In CloudWatch, find `default_group_assigned` with `trigger` equal to `PostConfirmation_ConfirmSignUp`. If your Google sign-in used the fallback, its log shows `TokenGeneration_HostedAuth`. |
| REST authorization        | Click **Check session** to receive a request ID. The API Gateway console lists the invocation URL under **Stages → v1**. In a signed-out terminal, use `curl.exe -i https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/v1/session` and confirm HTTP 401.                                                                                   |
| GraphQL and photo storage | Upload a small image and caption. Refresh and confirm both reappear. In browser DevTools under **Network**, the AppSync `/graphql` call should return your `Photo` record and the image should load from S3. Use a separate Google account to confirm the first account's photos are absent.                                                    |
| CloudWatch                | Use **Check session** to create a fresh request. In the Lambda console, open the function containing `photo-session`, then choose **Monitor → View CloudWatch logs**. Open the latest stream. Match `session_requested` and its `requestId` to the account panel. Capture the matching log event without tokens or personal information.        |
| GitHub Actions            | Open **Actions → Project checks** and capture the run summary showing ESLint, Prettier, Gitleaks, Semgrep, and npm audit. Capture details for any findings.                                                                                                                                                                                     |
| Automatic deployment      | After the initial deploy, push an ordinary project update to `main`. In Amplify, confirm the new run corresponds to that commit. Capture the completed build and deploy view with the commit and branch visible.                                                                                                                                |

The Post Confirmation trigger attaches `Users` on sign-up confirmation. A Pre Token Generation path covers hosted sign-ins that reach token generation without `Users`, so the first issued token can include the persisted group even if the trigger receives an older group snapshot. Both paths use the same Lambda. Cognito user-pool groups do not override IAM roles in this project. The identity pool issues temporary credentials with a per-identity S3 policy. AppSync separately authorizes captions by the Cognito user-pool owner.

## 5. Generate your submission PDF

The generator puts the architecture, real screenshots, clickable URLs, and a one-page reflection into `ROLLNUMBER_FinalProject.pdf`.

1. In `docs`, copy `submission.example.json` into a new `report-input` directory at project root and name it `submission.json`. Copy `findings.example.txt` to `report-input/findings.txt`. Fill in your official roll number and both real URLs. Replace the writing prompts with your own observations and include any CI findings and how you resolved or assessed them.
2. Save the Amplify, GitHub Actions, and CloudWatch screenshots to `report-input` with the filenames in the JSON. Additional screenshots may be listed as `extra_evidence` objects with `title` and `file` fields. Use PNG or JPEG and keep the relevant text readable.
3. Install [Python 3](https://www.python.org/downloads/) if needed. From the project root run:

```powershell
py -m pip install reportlab
py docs/make_submission.py report-input/submission.json
```

4. Open the generated PDF and test both links. Check that the instructor and TA can access the repository and sign into the live app from a separate browser session. Leave the deployment online through grading. Submit the single PDF by **Friday, 27 November 2026**.

## Troubleshooting

| Symptom                              | Check                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amplify can't find a Google secret   | Look under the Amplify app's **Hosting → Secrets**. Check both names and their branch scope, then redeploy.                                                                                                                                                            |
| `redirect_uri_mismatch` in Google    | Google needs the Cognito domain plus `/oauth2/idpresponse`, with HTTPS and no trailing slash. For a Cognito callback mismatch, check that the Amplify site origin matches `APP_ORIGIN` or the default branch URL.                                                      |
| Amplify backend deployment is denied | Check the Amplify service role and deployment permissions. If the job reports that CDK bootstrap is missing, use the region and account shown by the failed job and follow the [CDK bootstrapping guide](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html). |
| Gallery is empty after upload        | Check the browser Network panel for both the S3 upload and AppSync mutation. Retry the original selection if a caption write failed. The app reuses the photo ID for that selection.                                                                                   |
| npm audit flags an advisory          | Read the package path and severity in the job log. Update or replace the affected dependency where possible. Document any remaining advisory, its scope, and its impact.                                                                                               |
