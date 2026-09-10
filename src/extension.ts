import * as vscode from "vscode";
import Joyo from "../public/joyo.json";
import Jinmei from "../public/jinmei.json";

const UPDATE_INTERVAL_MS = 1000;

const CHARSET = {
    JOYO: new Set(Joyo),
    JINMEI: new Set(Jinmei),
};

class KanjiActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        return context.diagnostics
            .filter((diag) => diag?.source === "kanji" && diag?.code === "53f1")
            .map((diag) => {
                const action = new vscode.CodeAction(
                    "「𠮟（U+20B9F）」で置き換える",
                    vscode.CodeActionKind.QuickFix,
                );

                action.diagnostics = [diag];
                action.edit = new vscode.WorkspaceEdit();
                action.edit.replace(document.uri, diag.range, "𠮟");

                return action;
            });
    }
}

let updateTimer: NodeJS.Timeout | undefined;

const collection = vscode.languages.createDiagnosticCollection("ja-kanji");
vscode.languages.registerCodeActionsProvider("*", new KanjiActionProvider());

export function activate(context: vscode.ExtensionContext) {
    const editor = vscode.window.activeTextEditor;
    void (editor && updateVisible(editor));

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(
            (editor) => void (editor && updateVisible(editor)),
        ),

        vscode.window.onDidChangeTextEditorVisibleRanges(
            (event) => void updateVisible(event.textEditor),
        ),

        vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (editor?.document !== event.document) {
                return;
            }

            clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                updateVisible(editor);
            }, UPDATE_INTERVAL_MS);
        }),
    );
}

function updateVisible(editor: vscode.TextEditor) {
    const diagnostics: vscode.Diagnostic[] = [];
    const parser = parseLine.bind(null, editor.document);

    for (const { start, end } of editor.visibleRanges) {
        for (let line = start.line; line <= end.line; line++) {
            diagnostics.push(...parser(line));
        }
    }

    collection.set(editor.document.uri, diagnostics);
}

function parseLine(
    document: vscode.TextDocument,
    lineNumber: number,
): vscode.Diagnostic[] {
    const line = document.lineAt(lineNumber);
    const result: vscode.Diagnostic[] = [];

    // extract kanjis
    for (const match of line.text.matchAll(/\p{sc=Han}/gu)) {
        const kanji = match[0]!;

        // noma
        if (kanji === "々") {
            continue;
        }

        // joyo kanji
        if (CHARSET.JOYO.has(kanji)) {
            continue;
        }

        const range = new vscode.Range(
            lineNumber,
            match.index!,
            lineNumber,
            match.index! + kanji.length!,
        );

        // shikaru
        if (kanji === "叱") {
            result.push(
                Object.assign(
                    new vscode.Diagnostic(
                        range,
                        "「𠮟」（U+20B9F）の許容字体「叱」（U+53F1）が使われています。",
                        vscode.DiagnosticSeverity.Information,
                    ),
                    {
                        source: "kanji",
                        code: "53F1",
                    },
                ),
            );
            continue;
        }

        const cp = kanji.codePointAt(0)!.toString(16).toUpperCase();

        // jinmei kanji
        if (CHARSET.JINMEI.has(kanji)) {
            result.push(
                Object.assign(
                    new vscode.Diagnostic(
                        range,
                        `人名用漢字「${kanji}」（U+${cp}）が使われています。`,
                        vscode.DiagnosticSeverity.Hint,
                    ),
                    { source: "kanji", code: cp },
                ),
            );
            continue;
        }

        result.push(
            Object.assign(
                new vscode.Diagnostic(
                    range,
                    `常用漢字・人名用漢字でない漢字「${kanji}」（U+${cp}）が使われています。`,
                    vscode.DiagnosticSeverity.Information,
                ),
                { source: "kanji", code: cp },
            ),
        );
    }

    return result;
}

export function deactivate() {}
