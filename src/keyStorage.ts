import * as vscode from 'vscode';

const KEY_NAME = 'glm-api-key';

export async function setKey(context: vscode.ExtensionContext, key: string): Promise<void> {
    await context.globalState.update(KEY_NAME, key);
}

export async function getKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    return context.globalState.get<string>(KEY_NAME);
}

export async function deleteKey(context: vscode.ExtensionContext): Promise<void> {
    await context.globalState.update(KEY_NAME, undefined);
}
