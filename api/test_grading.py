import re

def _normalize_text(text: str) -> str:
    """Robustly normalize text for fuzzy matching."""
    if not text:
        return ""
    # Lowercase, strip
    t = text.strip().lower()
    # Remove basic punctuation from start/end (like full stops, commas)
    t = re.sub(r"^[^\w]+|[^\w]+$", "", t, flags=re.UNICODE)
    # Collapse multiple spaces
    t = re.sub(r"\s+", " ", t)
    return t

def test_normalization():
    test_cases = [
        ("  Hello World  ", "hello world"),
        ("Answer.", "answer"),
        ("Final, Answer!", "final, answer"), # punctuation inside remains
        ("...Start", "start"),
        ("صحيح ", "صحيح"),
        ("Multiple   Spaces", "multiple spaces"),
    ]
    for inp, expected in test_cases:
        res = _normalize_text(inp)
        assert res == expected, f"Failed: '{inp}' -> '{res}' (expected '{expected}')"
    print("All normalization tests passed!")

if __name__ == "__main__":
    test_normalization()
