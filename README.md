# GitHub Account Switcher

A VS Code extension to easily switch between multiple GitHub accounts. Displays the current authenticated user in the status bar with custom colors.

## Features

- Shows your GitHub username in the VS Code status bar
- Auto-refreshes every 5 minutes
- Click to open account manager
- Uses GitHub CLI (`gh`) for authentication
- Switch between multiple GitHub accounts
- Delete accounts easily
- Customize colors for each account (preset, custom hex, or random)
- Cross-platform: Windows, macOS, and Linux (hope it's work)

## Requirements

- [GitHub CLI](https://cli.github.com/) must be installed and authenticated
- Run `gh auth login` if you haven't already
- **Cross-platform:** Works on Windows, macOS, and Linux

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile the extension:
   ```bash
   npm run compile
   ```

3. Press `F5` in VS Code to open a new window with the extension loaded

## Usage

Once installed and activated:

- The status bar will show `$(github) username` on the left side
- Click on it to open the account manager where you can:
  - Switch between accounts
  - Add new accounts
  - Delete accounts
  - Set custom colors for each account
- If not authenticated, it will show "Not authenticated"

## Development

- Run `npm run compile` to compile TypeScript
- Run `npm run watch` for automatic compilation on file changes
- Press `F5` to test the extension in a new Extension Development Host window

## Commands

- `Refresh GitHub User` - Manually refresh the displayed GitHub user

## Extension Settings

Currently, this extension doesn't add any VS Code settings.

## Release Notes

### 0.0.1

Initial release with basic GitHub user display functionality.
