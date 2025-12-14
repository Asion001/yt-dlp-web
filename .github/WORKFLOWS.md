# GitHub Actions Workflows

This project includes automated CI/CD workflows using GitHub Actions.

## Workflows

### CI (Continuous Integration)
**File:** `.github/workflows/ci.yml`

Runs on every push and pull request to `main` and `develop` branches.

**Steps:**
1. Checkout code
2. Setup Bun runtime
3. Install dependencies
4. Run TypeScript type checking (`bunx tsc --noEmit`)
5. Build frontend assets
6. Upload build artifacts (retained for 7 days)

### Docker Build & Push
**File:** `.github/workflows/docker.yml`

Runs on:
- Push to `main` branch
- Version tags (e.g., `v1.0.0`)
- Manual workflow dispatch

**Features:**
- Multi-platform builds (linux/amd64, linux/arm64)
- Automatic versioning from Git tags
- Pushes to GitHub Container Registry (ghcr.io)
- Build cache optimization

**Image Tags:**
- `latest` - Latest main branch build
- `main` - Main branch builds
- `v1.0.0` - Semantic version tags
- `main-{sha}` - SHA-based tags

## Usage

### Running CI Locally

```bash
# Type check
bunx tsc --noEmit

# Build
bun run build
```

### Building Docker Image Locally

```bash
# Build image
docker build -t yt-dlp-web .

# Run container
docker run -p 3000:3000 \
  -v ./downloads:/downloads \
  -v ./data:/app/data \
  yt-dlp-web
```

### Pulling from GitHub Container Registry

```bash
docker pull ghcr.io/YOUR_USERNAME/yt-dlp-web:latest
```

## Secrets Required

For Docker workflow:
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

## Customization

To customize the workflows:

1. **Change branches:** Edit the `branches` array in workflow files
2. **Add tests:** Add a test step after type checking
3. **Add linting:** Add ESLint or Biome linting step
4. **Deployment:** Add deployment steps after successful builds

## Manual Workflow Trigger

You can manually trigger the Docker workflow from the Actions tab:
1. Go to Actions tab in your repository
2. Select "Docker Build" workflow
3. Click "Run workflow"
4. Select branch and click "Run workflow"
