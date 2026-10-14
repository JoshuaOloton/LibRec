# User acceptance test: LibRec

**Who:** 5–8 real students or staff of the library (not the developers), each tested alone.
**How long:** about 15 minutes each.
**What it checks:**

- **NFR1 (perceived usefulness):** does the student understand *why* each book was suggested?
- **NFR2 (ease of use):** does a first-time patron get a recommendation within **3 interactions**?

The observer watches and writes things down. The observer does not explain the screen, point, or hint. If a participant is stuck for more than a minute, note it and move on.

## Before you start (observer)

1. Start the app (`npm run dev`) and open it on the device the participant will use. A phone is better than a laptop for most students.
2. Each participant registers a new account, so nothing needs resetting between people. Their activity is stored (and shows in the admin statistics), so run the session on a database you do not mind filling; do not use your demo accounts.
3. Have this sheet and a stopwatch. Give each participant an ID (P1, P2, …). **Do not record real names.** The sign-up form asks for a name and an email, so tell the participant to type an invented one (for example "P1" and `p1@example.com`).

Read this aloud: *"We are testing the website, not you. Nothing you do can be wrong. Please say out loud what you are thinking. I will not be able to help you, but I will take notes."*

## Task A: first recommendation (NFR2)

Say: *"You are a new student. You have just opened LibRec and you want something to read. Create an account and get a book suggestion."*

The observer counts **interactions** from the moment the participant lands on the "Start your shelf" screen after registering. One interaction is one tap or click on that screen: choosing a subject, giving a star rating, or pressing the button that goes to Your shelf. Registering does not count.

Record:

| Item | Record |
|---|---|
| Path taken | picked subjects / rated popular books / something else |
| Interactions until the first recommendation appeared | number |
| Time from landing on "Start your shelf" to seeing Your shelf | seconds |
| Did the participant hesitate or look lost? Where? | notes |

**Pass:** 3 interactions or fewer.

## Task B: understanding the reasons (NFR1)

Say: *"This is your shelf. Please look at the first three books. For each one, tell me in your own words why you think it was suggested to you."*

Do not read the reason out. Write down what the participant says, then compare it with the reason slip under the cover.

| Book (position) | What the participant said | Matches the slip? (yes / partly / no) |
|---|---|---|
| Top pick | | |
| 2nd | | |
| 3rd | | |

Then ask: *"Did you notice the small note under each cover? What did you think it meant?"*

## Task C: using the suggestions

Say: *"Choose one book from your shelf that you would actually read, and borrow it. Then rate any book you already know."*

Record whether each action worked first time, and any confusion. Afterwards say: *"Go back to Your shelf. Has anything changed? What?"* (Watch whether they notice that the picks update after a rating.)

If time allows, say: *"Open any book and find other books like it."* (Checks the "More like this" row.)

## Questions (after the tasks)

Ask each question and circle or write the answer. Scale: **1 = strongly disagree, 5 = strongly agree.**

| # | Statement | Req | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|---|
| Q1 | I understood why each book was suggested to me. | NFR1 | | | | | |
| Q2 | Knowing the reason made me trust the suggestions more. | NFR1 | | | | | |
| Q3 | The suggestions were useful: I would read at least one of them. | NFR1 | | | | | |
| Q4 | It was easy to get my first suggestion. | NFR2 | | | | | |
| Q5 | I always knew what to do next. | NFR2 | | | | | |
| Q6 | I would use this to find books at my library. | NFR1 | | | | | |

Open questions (write the answer in the participant's words):

- What did you like most?
- What was confusing or annoying?
- If one thing could change, what would it be?
- Was there a suggestion that made you think "that is wrong for me"? Which, and what did its note say?

## Results table (one row per participant)

| ID | Device | Path (A) | Interactions (A) | Seconds (A) | B: reasons understood (of 3) | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 | | | | | | | | | | | | |
| P2 | | | | | | | | | | | | |
| P3 | | | | | | | | | | | | |
| P4 | | | | | | | | | | | | |
| P5 | | | | | | | | | | | | |
| P6 | | | | | | | | | | | | |
| P7 | | | | | | | | | | | | |
| P8 | | | | | | | | | | | | |
| **Total / mean** | | | | | | | | | | | | |

"Reasons understood" counts a book as understood when the participant's own words match the slip at least partly (yes or partly in Task B).

## Acceptance criteria

The criteria are set here, before testing, so they cannot be adjusted to fit the results.

| Requirement | Measure | Accepted when |
|---|---|---|
| NFR2 | Interactions until the first recommendation (Task A) | at least 80% of participants need 3 or fewer (for example 4 of 5, 5 of 6, 6 of 8) |
| NFR1 | Reasons understood (Task B) | the participants' own words matched the slip for at least 80% of the books checked |
| NFR1 | Q1 and Q3 | a mean of at least 4.0 for each |
| NFR2 | Q4 | a mean of at least 4.0 |

With 5–8 people these are indications, not statistics: report the counts and the quotes, not percentages alone. State the number of participants and how they were chosen, and list the changes the findings lead to.

## Writing it up

For the report, give: the number of participants and who they were (for example, "6 HND students from two departments"), the table above filled in, the pass or fail of each criterion, three or four direct quotes (good and bad), and the changes you would make. A failed criterion is a result, not a problem to hide.
