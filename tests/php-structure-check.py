"""Optional lexer-only PHP structure check. This is NOT php -l or runtime QA."""
from pathlib import Path
from pygments import lex
from pygments.lexers import PhpLexer
from pygments.token import Error, Punctuation

root = Path(__file__).resolve().parents[1]
files = sorted(root.rglob('*.php'))
for path in files:
    stack = []
    for token, value in lex(path.read_text(encoding='utf-8'), PhpLexer()):
        assert token not in Error, f'{path.relative_to(root)}: lexer error {value!r}'
        if token in Punctuation:
            for character in value:
                if character in '([{':
                    stack.append(character)
                elif character in ')]}':
                    assert stack and stack.pop() == {')': '(', ']': '[', '}': '{'}[character], f'{path.relative_to(root)}: unbalanced delimiters'
    assert not stack, f'{path.relative_to(root)}: unclosed delimiters'
print(f'PASS: Pygments lexer found balanced delimiters and no lexer errors in {len(files)} PHP files.')
print('NOT RUN: PHP parser, php -l, PHP PDO runtime, Apache, or OpenAI API. A lexer pass is NOT a syntax/runtime pass.')
