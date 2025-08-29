🚀 AI-Powered DSA Prep Hub
Welcome to the AI-Powered DSA Prep Hub, a comprehensive, interactive web application designed to help students and developers master Data Structures and Algorithms (DSA). This project leverages the Google Gemini API to move beyond static guides, creating a dynamic and personalized learning environment.

✨ Key Features
For All Users:
🤖 AI-Personalized Study Plans: Select DSA topics and a date range to have the Gemini API instantly generate a complete, day-by-day study schedule.

🗓️ Today's Focus View: A dedicated section highlights the topic scheduled for the current day, helping you stay on track.

🧠 On-Demand AI Explanations: Each item in your timetable includes an "Explain with AI" button for simple, beginner-friendly explanations and analogies.

💻 Intelligent Code Compiler & Explainer:

A built-in code editor supports C++, C, Python, and JavaScript.

The integrated "Explain Code with AI" feature analyzes your code, providing a line-by-line breakdown, identifying potential bugs, and suggesting improvements.

💬 Conversational AI Assistant: A chatbot powered by the Gemini API is available to answer any specific DSA-related questions.

✅ Progress Tracking & Customization: Mark topics as complete and reorder your schedule with drag-and-drop functionality. All changes are saved in real-time.

🔑 Flexible Authentication: Supports full-featured login via Google or a "Continue as Guest" option for a quick preview.

For Administrators:
📊 User Progress Dashboard: A dedicated admin panel provides a dashboard view of all registered users and their study plan progress.

🤖 AI-Assisted Content Management: Admins can add new topics by simply providing a name; the Gemini API generates the details, such as estimated duration and difficulty.

🗑️ Topic Management: Admins can delete topics from the public list, with changes reflected in real-time for all users.

🛠️ Technology Stack
Frontend: React.js, Tailwind CSS, dnd-kit, Axios

Backend & Database: Firebase (Firestore, Firebase Authentication)

APIs & Services: Google Gemini API, Judge0 API (for code compilation)

⚙️ Setup and Installation
Follow these steps to get the project running on your local machine.

Prerequisites
Node.js (v14 or later)

npm or yarn

1. Clone the Repository
git clone [https://github.com/your-username/dsa-prep-hub.git](https://github.com/your-username/dsa-prep-hub.git)
cd dsa-prep-hub

2. Install Dependencies
npm install
# or
yarn install

3. Set Up Environment Variables
Create a .env.local file in the root of your project and add the following variables:

# Firebase Configuration
VITE_API_KEY="YOUR_FIREBASE_API_KEY"
VITE_AUTH_DOMAIN="YOUR_FIREBASE_AUTH_DOMAIN"
VITE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID"
VITE_STORAGE_BUCKET="YOUR_FIREBASE_STORAGE_BUCKET"
VITE_MESSAGING_SENDER_ID="YOUR_FIREBASE_MESSAGING_SENDER_ID"
VITE_APP_ID="YOUR_FIREBASE_APP_ID"

# Gemini API Key
VITE_GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Admin User UID
VITE_ADMIN_UID="YOUR_ADMIN_FIREBASE_UID"

4. Firebase Setup
Go to the Firebase Console and create a new project.

Add a new Web App to your project to get your firebaseConfig details.

Enable Firestore Database and Google Authentication in the Firebase console.

Copy your Firebase config details into the .env.local file.

5. Update Firebase Security Rules
Navigate to Firestore Database > Rules in your Firebase console and replace the default rules with the following:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public topics collection
    match /artifacts/{appId}/public/data/topics/{topicId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == 'YOUR_ADMIN_FIREBASE_UID';
    }

    // Public users collection for the dashboard
    match /artifacts/{appId}/public/data/users/{userId} {
      allow read: if request.auth != null && request.auth.uid == 'YOUR_ADMIN_FIREBASE_UID';
      allow create: if request.auth != null && request.auth.uid == userId;
    }

    // User-specific timetables
    match /artifacts/{appId}/users/{userId}/timetable/{timetableId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}

Important: Replace YOUR_ADMIN_FIREBASE_UID in the security rules with your actual Firebase User ID to grant yourself admin privileges.

6. Get Your Gemini API Key
Go to the Google AI Studio to get your Gemini API key.

Add the key to your .env.local file.

7. Run the Development Server
npm run dev
# or
yarn dev

The application should now be running on http://localhost:5173.

🧑‍💻 Admin Setup
To gain admin access:

Log in to the application once with your Google account.

Go to the Firebase Console > Authentication > Users tab.

Copy the User UID for your account.

Paste this UID into the VITE_ADMIN_UID field in your .env.local file and in the Firebase security rules.

🤝 Contributing
Contributions are welcome! If you have suggestions for improvements, please open an issue or submit a pull request.

<img width="1875" height="966" alt="image" src="https://github.com/user-attachments/assets/4fece61c-bed0-4f03-870e-de09b838935b" />
<img width="1878" height="944" alt="image" src="https://github.com/user-attachments/assets/cfaad14d-4f70-4fd1-b883-23c0020b1a30" />
<img width="1886" height="954" alt="image" src="https://github.com/user-attachments/assets/80179de7-648a-413d-a5b2-a8e3368f278f" />
<img width="1892" height="953" alt="image" src="https://github.com/user-attachments/assets/73dfc88f-4415-427c-baf2-63c248bebb66" />


