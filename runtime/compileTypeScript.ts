import * as ts from "typescript";

export default function compileTypeScript(sourceFileNames: string[], sourceFiles: {[name: string]: string}, libSource: string, compilerOptions: ts.CompilerOptions={}) {
  if (compilerOptions.target == null) compilerOptions.target = ts.ScriptTarget.ES5;

  let script = "";
  let files: Array<{name: string; text: string}> = [];
  let sourceMaps: {[name: string]: any} = {};
  // Create a compilerHost object to allow the compiler to read and write files
  let compilerHost = {
    getSourceFile: (filename: string, languageVersion: any) => {
      if (sourceFiles[filename] != null) {
        return ts.createSourceFile(filename, sourceFiles[filename], compilerOptions.target);
      }
      if (filename === "lib.d.ts") {
        return ts.createSourceFile(filename, libSource, compilerOptions.target);
      }
      return null;
    },
    writeFile: (name: string, text: string, writeByteOrderMark: any) => {
      if (name.slice(name.length - 4) === ".map") {
        name = name.slice(0, name.length - 7);
        let sourceMap = JSON.parse( text );
        sourceMap.sourcesContent = [sourceFiles[`${name}.ts`]];
        sourceMaps[name] = sourceMap;
      }
      else {
        let filePath = name.slice(0, name.length - 3);
        let fileName = filePath.slice(filePath.lastIndexOf("/") + 1);

        let sourceMapText = `//# sourceMappingURL=${fileName}.js.map`;
        let sourceMapEmpty = new Array(sourceMapText.length).join(" ");
        text = text.replace(sourceMapText, sourceMapEmpty);

        files.push({ name: filePath, text });
        script += `\n${text}`;
      }
    },

    getDefaultLibFileName: () => { return "lib.d.ts"; },
    useCaseSensitiveFileNames: () => { return false; },
    getCanonicalFileName: (filename: string) => { return filename; },
    getCurrentDirectory: () => { return ""; },
    getNewLine: () => { return "\n"; }
  }

  // Create a program from inputs
  let program = ts.createProgram(sourceFileNames, compilerOptions, compilerHost);
  // Query for earyly errors
  let errors = ts.getPreEmitDiagnostics(program)
  let typeChecker: ts.TypeChecker;
  // Do not generate code in the presence of early errors
  if (errors.length === 0) {
    // Type check and get semantic errors
    typeChecker = program.getTypeChecker();
    // Generate output
    errors = program.emit().diagnostics
  }

  return {
    errors: errors.map((e: any) => { return {
      file: e.file.fileName,
      position: e.file.getLineAndCharacterOfPosition(e.start),
      length: e.length,
      message: e.messageText
    }}),
    program, typeChecker, script, sourceMaps, files
  }
}
