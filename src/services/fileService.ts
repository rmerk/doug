import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FileService {
  /**
   * Read content from a file
   */
  public async readFile(uri: vscode.Uri): Promise<string> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      return document.getText();
    } catch (error) {
      throw new Error(`Failed to read file: ${uri.fsPath}`);
    }
  }

  /**
   * Modify a file with new content
   */
  public async modifyFile(uri: vscode.Uri, newContent: string): Promise<boolean> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );

      edit.replace(uri, fullRange, newContent);

      return await vscode.workspace.applyEdit(edit);
    } catch (error) {
      void vscode.window.showErrorMessage(`Failed to modify file: ${uri.fsPath}`);
      return false;
    }
  }

  /**
   * Modify a specific range in a file
   */
  public async modifyFileRange(uri: vscode.Uri, range: vscode.Range, newContent: string): Promise<boolean> {
    try {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, range, newContent);

      return await vscode.workspace.applyEdit(edit);
    } catch (error) {
      void vscode.window.showErrorMessage(`Failed to modify file range: ${uri.fsPath}`);
      return false;
    }
  }

  /**
   * Create a new file with content
   */
  public async createFile(filePath: string, content: string): Promise<vscode.Uri | null> {
    try {
      // Create parent directories if they don't exist
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const uri = vscode.Uri.file(filePath);

      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { overwrite: false });

      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        // After file is created, add content to it
        const modifySuccess = await this.modifyFile(uri, content);
        return modifySuccess ? uri : null;
      }

      return null;
    } catch (error) {
      void vscode.window.showErrorMessage(`Failed to create file: ${filePath}`);
      return null;
    }
  }

  /**
   * Apply multiple file modifications as a single transaction
   */
  public async applyMultipleEdits(
    edits: Array<{
      uri: vscode.Uri;
      range: vscode.Range;
      newContent: string;
    }>
  ): Promise<boolean> {
    const workspaceEdit = new vscode.WorkspaceEdit();

    for (const edit of edits) {
      workspaceEdit.replace(edit.uri, edit.range, edit.newContent);
    }

    return vscode.workspace.applyEdit(workspaceEdit);
  }

  /**
   * Get a range for a specific line or line range
   */
  public async getLineRange(uri: vscode.Uri, startLine: number, endLine?: number): Promise<vscode.Range> {
    const document = await vscode.workspace.openTextDocument(uri);
    const start = new vscode.Position(startLine, 0);

    if (endLine === undefined) {
      endLine = startLine;
    }

    // If requesting the last line, make sure the end position is at the end of content
    const lineCount = document.lineCount;
    const isLastLine = endLine >= lineCount - 1;

    let end: vscode.Position;

    if (isLastLine) {
      const lastPos = document.positionAt(document.getText().length);
      end = lastPos;
    } else {
      // Get the start position of the next line to include line break
      end = new vscode.Position(endLine + 1, 0);
    }

    return new vscode.Range(start, end);
  }
}