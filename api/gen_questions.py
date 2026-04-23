import csv
import random

# Headers matching your QuestionsTab.tsx CSV logic
HEADERS = [
    "id",
    "paper_set",
    "section",
    "type",
    "language",
    "question_en",
    "question_ar",
    "option_a_en",
    "option_b_en",
    "option_c_en",
    "option_d_en",
    "correct_answer",
    "marks",
    "stream",
]


def generate_questions():
    questions = []

    # SECTION 1: General Knowledge & Aptitude (20 MCQs)
    idx = 1
    for i in range(1, 6):
        questions.append(
            {
                "id": idx,
                "paper_set": "B",
                "section": 1,
                "type": "mcq",
                "language": "en",
                "question_en": f"General Knowledge Question {i}: Which Indian state is known as the 'Land of Five Rivers'?",
                "question_ar": "",
                "option_a_en": "Punjab",
                "option_b_en": "Kerala",
                "option_c_en": "Gujarat",
                "option_d_en": "Tamil Nadu",
                "correct_answer": "A",
                "marks": 1.0,
                "stream": "",
            }
        )
        idx += 1

    # SECTION 2: English Language & Grammar (20 Fill in the Blanks)
    for i in range(1, 6):
        questions.append(
            {
                "id": idx,
                "paper_set": "B",
                "section": 2,
                "type": "fill_blank",
                "language": "en",
                "question_en": f"Complete the sentence {i}: The students ______ finished their assignment before the bell rang.",
                "question_ar": "",
                "option_a_en": "",
                "option_b_en": "",
                "option_c_en": "",
                "option_d_en": "",
                "correct_answer": "had",
                "marks": 1.0,
                "stream": "",
            }
        )

        idx += 1
    # SECTION 3: Islamic Thought & Culture (20 Bilingual MCQs)
    # Using simple Arabic placeholders for the example
    for i in range(1, 6):
        questions.append(
            {
                "id": idx,
                "paper_set": "B",
                "section": 3,
                "type": "mcq",
                "language": "both",
                "question_en": f"Islamic History Q{i}: In which year did the Hijra occur?",
                "question_ar": f"السؤال الثقافي {i}: في أي عام حدثت الهجرة؟",
                "option_a_en": "622 CE",
                "option_b_en": "610 CE",
                "option_c_en": "632 CE",
                "option_d_en": "615 CE",
                "correct_answer": "A",
                "marks": 2.0,
                "stream": "",
            }
        )
        idx += 1

    # SECTION 4: Logic & Ethics (20 True/False)
    for i in range(1, 6):
        questions.append(
            {
                "id": idx,
                "paper_set": "B",
                "section": 4,
                "type": "true_false",
                "language": "en",
                "question_en": f"Logic Statement {i}: Inductive reasoning moves from specific observations to broader generalizations.",
                "question_ar": "",
                "option_a_en": "",
                "option_b_en": "",
                "option_c_en": "",
                "option_d_en": "",
                "correct_answer": "true",
                "marks": 1.0,
                "stream": "",
            }
        )
        idx += 1

    # SECTION 5: Subject Specific - Humanities/Science (20 Descriptive)
    streams = ["science", "humanities", "commerce", "general"]
    for i in range(1, 6):
        stream = random.choice(streams)
        questions.append(
            {
                "id": idx,
                "paper_set": "B",
                "section": 5,
                "type": "descriptive",
                "language": "en",
                "question_en": f"[{stream.upper()}] Essay Question {i}: Explain the impact of sustainable development on modern economy.",
                "question_ar": "",
                "option_a_en": "",
                "option_b_en": "",
                "option_c_en": "",
                "option_d_en": "",
                "correct_answer": "Manual Grading",
                "marks": 5.0,
                "stream": stream,
            }
        )
        idx += 1

    return questions


def save_csv(data):
    with open("25_questions_import.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(data)
    print("Successfully generated 25 questions in 25_questions_import.csv")


if __name__ == "__main__":
    data = generate_questions()
    save_csv(data)
