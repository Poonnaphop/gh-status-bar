import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

// Find the gh command path
async function findGhPath(): Promise<string> {
    const platform = os.platform();
    
    if (platform === 'win32') {
        // Windows: gh should be in PATH
        return 'gh';
    } else if (platform === 'darwin') {
        // macOS: try common homebrew paths
        const paths = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh'];
        for (const path of paths) {
            try {
                await execAsync(`test -f ${path}`);
                return path;
            } catch {
                continue;
            }
        }
        // Fallback to PATH
        return 'gh';
    } else {
        // Linux: should be in PATH
        return 'gh';
    }
}

// Execute gh command with proper shell environment
async function execGh(command: string): Promise<{ stdout: string; stderr: string }> {
    const ghPath = await findGhPath();
    const fullCommand = `${ghPath} ${command}`;
    
    // On Windows, use cmd.exe; on Unix, use sh
    const shell = platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    
    return await execAsync(fullCommand, { 
        shell,
        env: { ...process.env }
    });
}

const platform = os.platform();

let statusBarItem: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
    console.log('GitHub Account Switcher extension is now active');
    
    // Store context globally for access in other functions
    extensionContext = context;

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100 // Priority - higher numbers = more to the left
    );
    
    // Add tooltip
    statusBarItem.tooltip = 'GitHub Authenticated User - Click to refresh';
    
    // Make it clickable to refresh
    statusBarItem.command = 'gh-status-bar.refresh';
    
    // Show the status bar item immediately
    statusBarItem.text = "$(sync~spin) Loading...";
    statusBarItem.show();
    
    context.subscriptions.push(statusBarItem);

    // Register refresh command
    const refreshCommand = vscode.commands.registerCommand(
        'gh-status-bar.refresh',
        async () => {
            await showAccountMenu();
        }
    );
    context.subscriptions.push(refreshCommand);

    // Initial update
    updateGitHubUser();
    
    // Update every 5 minutes
    const interval = setInterval(() => {
        updateGitHubUser();
    }, 5 * 60 * 1000);
    
    context.subscriptions.push({
        dispose: () => clearInterval(interval)
    });
}

async function showAccountMenu() {
    // Build quick pick items with buttons interface
    interface QuickPickItemWithButton extends vscode.QuickPickItem {
        buttons?: vscode.QuickInputButton[];
        action?: string;
        username?: string;
    }
    
    const colorButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('symbol-color'),
        tooltip: 'Set color for this account'
    };
    
    const deleteButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('trash'),
        tooltip: 'Delete this account'
    };
    
    // Create and show quick pick immediately
    const quickPick = vscode.window.createQuickPick<QuickPickItemWithButton>();
    quickPick.placeholder = 'Loading accounts...';
    quickPick.busy = true; // Show loading spinner
    quickPick.show();
    
    try {
        let accounts: GitHubAccount[] = [];
        
        // Try to get all accounts from gh auth status
        try {
            const { stdout } = await execGh('auth status 2>&1');
            accounts = parseAccounts(stdout);
        } catch (error: any) {
            // If error is because no accounts are logged in, that's okay
            if (error.stdout && error.stdout.includes('not logged into any GitHub hosts')) {
                accounts = [];
            } else {
                throw error;
            }
        }
        
        const items: QuickPickItemWithButton[] = [];
        
        // Show message if no accounts
        if (accounts.length === 0) {
            items.push({
                label: '$(info) No accounts available',
                description: 'Click below to add an account',
                action: 'none'
            });
            items.push({
                label: '',
                kind: vscode.QuickPickItemKind.Separator
            });
        } else {
            // Add current accounts with color and delete buttons
            accounts.forEach(account => {
                const savedColor = getAccountColor(account.username);
                const colorIndicator = savedColor ? `$(circle-filled)` : '';
                
                items.push({
                    label: `$(${account.active ? 'check' : 'circle-outline'}) ${account.username} ${colorIndicator}`,
                    description: account.active ? '✓ Active' : 'Click to switch',
                    detail: `Protocol: ${account.protocol}${savedColor ? ` • Color: ${savedColor}` : ''}`,
                    buttons: [colorButton, deleteButton],
                    action: 'switch',
                    username: account.username
                });
            });
            
            // Add separator
            items.push({
                label: '',
                kind: vscode.QuickPickItemKind.Separator
            });
        }
        
        // Always show add new account and refresh options
        items.push({
            label: '$(add) Add New Account',
            description: 'Run gh auth login',
            action: 'add'
        });
        
        if (accounts.length > 0) {
            items.push({
                label: '$(refresh) Refresh',
                description: 'Reload GitHub user',
                action: 'refresh'
            });
        }
        
        // Update quick pick with loaded data
        quickPick.busy = false;
        quickPick.items = items;
        quickPick.placeholder = accounts.length === 0 ? 'No GitHub accounts - Add one to get started' : 'GitHub Account Manager';
        
        // Handle item selection
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (!selected) {
                return;
            }
            
            quickPick.hide();
            
            const action = selected.action;
            const username = selected.username;
            
            if (action === 'switch' && username) {
                switchAccount(username);
            } else if (action === 'add') {
                addNewAccount();
            } else if (action === 'refresh') {
                updateGitHubUser();
                vscode.window.showInformationMessage('GitHub user refreshed!');
            }
        });
        
        // Handle button clicks (color and delete buttons)
        quickPick.onDidTriggerItemButton(async (e) => {
            const item = e.item;
            if (item.username) {
                // Check which button was clicked
                if (e.button.tooltip === 'Set color for this account') {
                    quickPick.hide();
                    await setAccountColor(item.username);
                } else if (e.button.tooltip === 'Delete this account') {
                    quickPick.hide();
                    await deleteAccount(item.username);
                }
            }
        });
        
        quickPick.onDidHide(() => quickPick.dispose());
        
    } catch (error) {
        console.error('Error showing account menu:', error);
        quickPick.hide();
        vscode.window.showErrorMessage('Failed to load GitHub accounts');
    }
}

interface GitHubAccount {
    username: string;
    active: boolean;
    protocol: string;
}

function parseAccounts(output: string): GitHubAccount[] {
    const accounts: GitHubAccount[] = [];
    const lines = output.split('\n');
    
    let currentAccount: Partial<GitHubAccount> = {};
    
    for (const line of lines) {
        // Match: "Logged in to github.com account USERNAME (keyring)"
        const accountMatch = line.match(/Logged in to github\.com account (\S+)/);
        if (accountMatch) {
            if (currentAccount.username) {
                accounts.push(currentAccount as GitHubAccount);
            }
            currentAccount = { username: accountMatch[1] };
        }
        
        // Match: "- Active account: true"
        const activeMatch = line.match(/Active account: (\w+)/);
        if (activeMatch) {
            currentAccount.active = activeMatch[1] === 'true';
        }
        
        // Match: "- Git operations protocol: https"
        const protocolMatch = line.match(/Git operations protocol: (\w+)/);
        if (protocolMatch) {
            currentAccount.protocol = protocolMatch[1];
        }
    }
    
    // Add the last account
    if (currentAccount.username) {
        accounts.push(currentAccount as GitHubAccount);
    }
    
    return accounts;
}

async function switchAccount(username: string) {
    try {
        await execGh(`auth switch -u ${username}`);
        vscode.window.showInformationMessage(`Switched to account: ${username}`);
        await updateGitHubUser();
    } catch (error) {
        console.error('Error switching account:', error);
        vscode.window.showErrorMessage(`Failed to switch to ${username}`);
    }
}

async function deleteAccount(username: string) {
    const confirm = await vscode.window.showWarningMessage(
        `Delete account ${username}?`,
        { modal: true },
        'Delete'
    );
    
    if (confirm === 'Delete') {
        try {
            await execGh(`auth logout -u ${username}`);
            vscode.window.showInformationMessage(`Deleted account: ${username}`);
            await updateGitHubUser();
        } catch (error) {
            console.error('Error deleting account:', error);
            vscode.window.showErrorMessage(`Failed to delete ${username}`);
        }
    }
}

async function addNewAccount() {
    const terminal = vscode.window.createTerminal('GitHub Login');
    terminal.show();
    terminal.sendText('gh auth login');
    
    vscode.window.showInformationMessage(
        'Complete the login in the terminal, then click the status bar to refresh',
        'OK'
    );
}

function getAccountColor(username: string): string | undefined {
    const colors = extensionContext.globalState.get<Record<string, string>>('accountColors', {});
    return colors[username];
}

function saveAccountColor(username: string, color: string) {
    const colors = extensionContext.globalState.get<Record<string, string>>('accountColors', {});
    colors[username] = color;
    extensionContext.globalState.update('accountColors', colors);
}

function generateColorFromUsername(username: string): string {
    // Simple hash function to generate a deterministic color from username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert hash to HSL color (with good saturation and lightness for visibility)
    const hue = Math.abs(hash % 360);
    const saturation = 65 + (Math.abs(hash >> 8) % 20); // 65-85%
    const lightness = 55 + (Math.abs(hash >> 16) % 15); // 55-70%
    
    // Convert HSL to hex
    return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

async function setAccountColor(username: string) {
    const randomColor = generateColorFromUsername(username);
    
    const colorOptions = [
        { label: '$(symbol-color) Random (from username)', color: randomColor, description: `Unique color: ${randomColor}` },
        { label: '$(edit) Custom Hex Code...', color: 'custom', description: 'Enter your own hex code' },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(circle-filled) Red', color: '#ff6b6b', description: 'Red' },
        { label: '$(circle-filled) Orange', color: '#ffa500', description: 'Orange' },
        { label: '$(circle-filled) Yellow', color: '#ffd93d', description: 'Yellow' },
        { label: '$(circle-filled) Green', color: '#6bcf7f', description: 'Green' },
        { label: '$(circle-filled) Blue', color: '#4dabf7', description: 'Blue' },
        { label: '$(circle-filled) Purple', color: '#b197fc', description: 'Purple' },
        { label: '$(circle-filled) Pink', color: '#ff6ec7', description: 'Pink' },
        { label: '$(circle-filled) Cyan', color: '#22d3ee', description: 'Cyan' },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(circle-outline) Default (No color)', color: '', description: 'Remove custom color' }
    ];
    
    const selected = await vscode.window.showQuickPick(colorOptions, {
        placeHolder: `Choose color for ${username}`
    });
    
    if (!selected) {
        return;
    }
    
    if (selected.color === 'custom') {
        // Show input box for custom hex code
        const customHex = await vscode.window.showInputBox({
            prompt: 'Enter hex color code (e.g., #ff5733 or ff5733)',
            placeHolder: '#ff5733',
            validateInput: (value) => {
                // Remove # if present
                const hex = value.startsWith('#') ? value.slice(1) : value;
                
                // Check if valid hex
                if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
                    return 'Please enter a valid 6-digit hex color code (e.g., #ff5733)';
                }
                return null;
            }
        });
        
        if (customHex) {
            // Ensure it starts with #
            const normalizedHex = customHex.startsWith('#') ? customHex : `#${customHex}`;
            saveAccountColor(username, normalizedHex);
            vscode.window.showInformationMessage(`Custom color ${normalizedHex} set for ${username}`);
            await updateGitHubUser();
        }
    } else if (selected.color) {
        saveAccountColor(username, selected.color);
        vscode.window.showInformationMessage(`Color set for ${username}`);
        await updateGitHubUser();
    } else {
        // Remove color
        const colors = extensionContext.globalState.get<Record<string, string>>('accountColors', {});
        delete colors[username];
        extensionContext.globalState.update('accountColors', colors);
        vscode.window.showInformationMessage(`Color removed for ${username}`);
        await updateGitHubUser();
    }
}

async function updateGitHubUser() {
    try {
        console.log('Updating GitHub user');
        statusBarItem.text = "$(sync~spin) Fetching...";
        statusBarItem.color = undefined; // Reset color
        
        // Use GitHub CLI to get current user
        const { stdout } = await execGh('api user --jq .login');
        const username = stdout.trim();
        
        if (username) {
            console.log('Got username:', username);
            
            // Get custom color for this user
            const customColor = getAccountColor(username);
            
            statusBarItem.text = `$(github) ${username}`;
            statusBarItem.tooltip = `GitHub: ${username}\nClick to manage accounts`;
            
            // Apply custom color if set
            if (customColor) {
                statusBarItem.color = customColor;
            }
        } else {
            throw new Error('Could not get username');
        }
    } catch (error) {
        // Not authenticated or gh CLI not available
        console.log('Error fetching GitHub user:', error);
        statusBarItem.text = "$(github) Not authenticated";
        statusBarItem.tooltip = "GitHub CLI not authenticated\nClick to login";
        statusBarItem.color = undefined;
    }
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
