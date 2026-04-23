# import csv
# import random
# from faker import Faker
# from datetime import datetime, timedelta

# # Initialize Faker with Indian locale for realistic names/addresses
# fake = Faker("en_IN")

# COURSES = [
#     "MASTER'S DEGREE IN CONTEMPORARY FIQH",
#     "MASTER'S DEGREE IN CONTEMPORARY ISLAMIC THOUGHT",
#     "PG DIPLOMA IN ARABIC & ENGLISH TRANSLATION",
#     "PREPARATORY COURSE - COMMERCE",
#     "PREPARATORY COURSE - HUMANITIES",
#     "PREPARATORY COURSE - SCIENCE",
#     "UNDER GRADUATE PROGRAM ( USOOLUDHEEN & SHARIA )",
# ]

# EXAM_CENTERS = [
#     "Kannur",
#     "Trivandrum",
#     "Ernakulam",
#     "Calicut",
#     "Al Jamia Campus",
#     "Other States",
#     "KSA",
#     "UAE",
#     "Oman",
#     "Qatar",
#     "Bahrain",
#     "Kuwait",
#     "Others",
# ]

# BLOOD_GROUPS = ["O +", "O -", "A +", "A -", "B +", "B -", "AB +", "AB -"]
# QUALIFICATIONS = ["SSLC", "10th CBSE", "Plus Two", "Degree"]
# STREAMS = ["science", "humanities", "commerce", "general"]
# ADMISSION_YEAR = "2026-27"


# def generate_dob():
#     # Generate a realistic birth date for college applicants (roughly 18-25 years old)
#     start_date = datetime.now() - timedelta(days=25 * 365)
#     end_date = datetime.now() - timedelta(days=18 * 365)
#     dob = fake.date_between(start_date=start_date, end_date=end_date)
#     return dob.strftime("%Y-%m-%d")


# def generate_student_data(num_records=50):
#     data = []

#     for _ in range(num_records):
#         gender = random.choice(["Male", "Female"])
#         first_name = (
#             fake.first_name_male() if gender == "Male" else fake.first_name_female()
#         )
#         last_name = fake.last_name()

#         mobile = fake.numerify(text="9#########")
#         whatsapp = (
#             mobile if random.choice([True, False]) else fake.numerify(text="8#########")
#         )

#         # Clean up faker strings that might contain accidental newlines
#         house_name = f"{fake.building_number()} {fake.street_name()}".replace("\n", " ")
#         street_address = fake.street_address().replace("\n", ", ")
#         institution = f"{fake.company().replace(chr(10), ' ')} Public School"

#         # EXACT matches to your requested form fields
#         student = {
#             "Admission Year": ADMISSION_YEAR,
#             "Course": random.choice(COURSES),
#             "Student's Name": f"{first_name} {last_name}",
#             "Parent's Name": fake.name_male(),
#             "Mobile Number": mobile,
#             "Email address": fake.free_email(),
#             "Date of Birth": generate_dob(),
#             "Gender": gender,
#             "WhatsApp Number": whatsapp,
#             "Blood Group": random.choice(BLOOD_GROUPS),
#             "House Name": house_name,
#             "Street Address": street_address,
#             "City": fake.city(),
#             "PO": f"{fake.city()} PO",
#             "Pincode": fake.postcode(),
#             "District": fake.city(),
#             "State": fake.state(),
#             "Nationality": "Indian",
#             "Institution Last Attended": institution,
#             "Education Qualification": random.choice(QUALIFICATIONS),
#             "Stream": random.choice(STREAMS),
#             "Examination Center": random.choice(EXAM_CENTERS),
#         }
#         data.append(student)

#     return data


# def save_to_csv(data, filename="student_form_data.csv"):
#     if not data:
#         return

#     # Extract headers exactly as defined in the dict
#     headers = data[0].keys()

#     with open(filename, mode="w", newline="", encoding="utf-8") as file:
#         writer = csv.DictWriter(file, fieldnames=headers)
#         writer.writeheader()
#         writer.writerows(data)

#     print(f"Successfully generated {len(data)} records and saved to {filename}")


# if __name__ == "__main__":
#     print("Generating student data...")
#     records = generate_student_data(500)
#     save_to_csv(records)

import csv
import random
from faker import Faker
from datetime import datetime, timedelta

# Initialize Faker with Indian locale for realistic names/addresses
fake = Faker("en_IN")

COURSES = [
    "MASTER'S DEGREE IN CONTEMPORARY FIQH",
    "MASTER'S DEGREE IN CONTEMPORARY ISLAMIC THOUGHT",
    "PG DIPLOMA IN ARABIC & ENGLISH TRANSLATION",
    "PREPARATORY COURSE - COMMERCE",
    "PREPARATORY COURSE - HUMANITIES",
    "PREPARATORY COURSE - SCIENCE",
    "UNDER GRADUATE PROGRAM ( USOOLUDHEEN & SHARIA )",
]

EXAM_CENTERS = [
    "Kannur",
    "Trivandrum",
    "Ernakulam",
    "Calicut",
    "Al Jamia Campus",
    "Other States",
    "KSA",
    "UAE",
    "Oman",
    "Qatar",
    "Bahrain",
    "Kuwait",
    "Others",
]

BLOOD_GROUPS = ["O +", "O -", "A +", "A -", "B +", "B -", "AB +", "AB -"]
QUALIFICATIONS = ["SSLC", "10th CBSE", "Plus Two", "Degree"]
ADMISSION_YEAR = "2026-27"


def generate_dob():
    # Generate a realistic birth date for college applicants (roughly 18-25 years old)
    start_date = datetime.now() - timedelta(days=25 * 365)
    end_date = datetime.now() - timedelta(days=18 * 365)
    dob = fake.date_between(start_date=start_date, end_date=end_date)
    return dob.strftime("%Y-%m-%d")


def generate_student_data(num_records=50):
    data = []

    for _ in range(num_records):
        gender = random.choice(["Male", "Female"])
        first_name = (
            fake.first_name_male() if gender == "Male" else fake.first_name_female()
        )
        last_name = fake.last_name()

        mobile = fake.numerify(text="9#########")
        whatsapp = (
            mobile if random.choice([True, False]) else fake.numerify(text="8#########")
        )

        # Clean up faker strings that might contain accidental newlines
        house_name = f"{fake.building_number()} {fake.street_name()}".replace("\n", " ")
        street_address = fake.street_address().replace("\n", ", ")
        institution = f"{fake.company().replace(chr(10), ' ')} Public School"

        # --- THE FIX: Derive stream logically from the selected course ---
        selected_course = random.choice(COURSES)
        
        if "COMMERCE" in selected_course:
            stream = "commerce"
        elif "HUMANITIES" in selected_course:
            stream = "humanities"
        elif "SCIENCE" in selected_course:
            stream = "science"
        else:
            stream = "general"
        # -----------------------------------------------------------------

        # EXACT matches to your requested form fields
        student = {
            "Admission Year": ADMISSION_YEAR,
            "Course": selected_course,
            "Student's Name": f"{first_name} {last_name}",
            "Parent's Name": fake.name_male(),
            "Mobile Number": mobile,
            "Email address": fake.free_email(),
            "Date of Birth": generate_dob(),
            "Gender": gender,
            "WhatsApp Number": whatsapp,
            "Blood Group": random.choice(BLOOD_GROUPS),
            "House Name": house_name,
            "Street Address": street_address,
            "City": fake.city(),
            "PO": f"{fake.city()} PO",
            "Pincode": fake.postcode(),
            "District": fake.city(),
            "State": fake.state(),
            "Nationality": "Indian",
            "Institution Last Attended": institution,
            "Education Qualification": random.choice(QUALIFICATIONS),
            "Stream": stream,
            "Examination Center": random.choice(EXAM_CENTERS),
        }
        data.append(student)

    return data


def save_to_csv(data, filename="student_form_data.csv"):
    if not data:
        return

    # Extract headers exactly as defined in the dict
    headers = data[0].keys()

    with open(filename, mode="w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data)

    print(f"Successfully generated {len(data)} records and saved to {filename}")


if __name__ == "__main__":
    print("Generating student data...")
    records = generate_student_data(500)
    save_to_csv(records)