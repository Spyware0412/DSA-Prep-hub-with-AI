import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from "axios";

// --- Firebase Integration ---
import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    onAuthStateChanged, 
    GoogleAuthProvider,
    signInWithPopup,
    signInAnonymously,
    signOut 
} from "firebase/auth";
import { 
    getFirestore, 
    doc, 
    addDoc,
    collection, 
    onSnapshot,
    updateDoc,
    deleteDoc,
    writeBatch,
    query,
    orderBy,
    getDocs,
    setDoc,
    getDoc
} from "firebase/firestore";

/*
================================================================================
== IMPORTANT: FIREBASE SECURITY RULES FIX ======================================
================================================================================

The "Missing or insufficient permissions" error is because the default 
Firestore security rules are too restrictive. You need to replace them with
rules that allow your app to function correctly.

1. Go to your Firebase Console.
2. Select your project.
3. Go to Firestore Database > Rules tab.
4. Delete the existing rules and paste the following code:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public topics collection
    match /artifacts/{appId}/public/data/topics/{topicId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == 'REPLACE_WITH_YOUR_ADMIN_GOOGLE_UID';
    }

    // Public users collection for the dashboard
    match /artifacts/{appId}/public/data/users/{userId} {
      // Admin can read all user profiles
      allow read: if request.auth != null && request.auth.uid == 'REPLACE_WITH_YOUR_ADMIN_GOOGLE_UID';
      // A user can create their own profile document
      allow create: if request.auth != null && request.auth.uid == userId;
    }

    // User-specific timetables
    match /artifacts/{appId}/users/{userId}/timetable/{timetableId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}

5. Click "Publish". This will resolve the permission errors.

================================================================================
*/


// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: import.meta.env.VITE_API_KEY, // Fallback config
    authDomain: import.meta.env.VITE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_APP_ID
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'dsa-prep-hub';
const ADMIN_UID = import.meta.env.VITE_ADMIN_UID; 

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Real Gemini API Implementation ---
const callGeminiAPI = async (prompt, jsonOutput = false, schema = null) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 

    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
        throw new Error("Gemini API key is missing. Please add your key to the callGeminiAPI function.");
    }    
    const apiUrl =`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    if (jsonOutput) {
        payload.generationConfig = {
            response_mime_type: "application/json",
            response_schema: schema,
        };
    }

    let retries = 3;
    let delay = 1000;

    while (retries > 0) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) {
                     const errorInfo = result.promptFeedback || { error: "Invalid or empty response from API" };
                     throw new Error(`API Error: ${JSON.stringify(errorInfo)}`);
                }
                return text;
            } else {
                 const errorBody = await response.text();
                 console.error("API Error Body:", errorBody);
                 throw new Error(`API request failed with status ${response.status}`);
            }
        } catch (error) {
            console.error(`API call failed: ${error.message}. Retrying in ${delay / 1000}s...`);
            retries--;
            if (retries === 0) throw new Error(`API call failed after multiple retries. Last error: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
};


// --- Components ---

const TopicItem = ({ topic, onSelect, isSelected, user, onDelete }) => (
    <div
        className={`p-3 my-2 rounded-lg cursor-pointer transition-all duration-200 flex justify-between items-center ${isSelected ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300' : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'}`}
        onClick={() => onSelect(topic)}
    >
        <div>
            <span className="font-semibold text-gray-800">{topic.name}</span>
            <p className="text-sm text-gray-500 mt-1">{topic.duration} days</p>
        </div>
        <div className="flex items-center">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                topic.difficulty === 'Easy' ? 'bg-green-100 text-green-800' :
                topic.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
            }`}>
                {topic.difficulty}
            </span>
            {user && user.uid === ADMIN_UID && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(topic.id); }} className="ml-4 text-gray-400 hover:text-red-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            )}
        </div>
    </div>
);

const SortableTimetableItem = ({ item, index, onToggleComplete }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
    const [explanation, setExplanation] = useState('');
    const [isExplainLoading, setIsExplainLoading] = useState(false);
    
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const getExplanation = async () => {
        setIsExplainLoading(true);
        setExplanation('');
        try {
            const prompt = `Explain the concept of '${item.topic}' in a simple, beginner-friendly way. Use an analogy to make it easier to understand.`;
            const response = await callGeminiAPI(prompt);
            setExplanation(response);
        } catch (error) {
            setExplanation(`Error fetching explanation: ${error.message}`);
        } finally {
            setIsExplainLoading(false);
        }
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`bg-white p-5 mb-4 rounded-xl shadow-sm border border-gray-200 touch-none transition-all ${item.completed ? 'opacity-60 bg-gray-50' : 'opacity-100'}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-start">
                    <input
                        type="checkbox"
                        checked={item.completed || false}
                        onChange={() => onToggleComplete(item.id, !item.completed)}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1 mr-4 cursor-pointer"
                    />
                    <div>
                        <h3 className={`text-lg font-bold text-gray-800 ${item.completed ? 'line-through' : ''}`}>{index + 1}. {item.topic}</h3>
                        <span className="text-sm font-semibold text-blue-600">{item.date}</span>
                    </div>
                </div>
                 <button onClick={getExplanation} disabled={isExplainLoading} className="bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full hover:bg-blue-200 transition-colors disabled:opacity-50">
                    ✨ {isExplainLoading ? 'Thinking...' : 'Explain with AI'}
                </button>
            </div>
            {item.goal && <p className="text-gray-700 text-sm mt-3 ml-9"><strong>Goal:</strong> {item.goal}</p>}
            <div className="mt-4 ml-9 space-y-3">
                <div>
                    <h4 className="font-semibold text-gray-700">What to do:</h4>
                    <p className="text-gray-600 text-sm mt-1">{item.what}</p>
                </div>
                <div>
                    <h4 className="font-semibold text-gray-700">How to do it:</h4>
                    <p className="text-gray-600 text-sm mt-1">{item.how}</p>
                </div>
                <div>
                    <h4 className="font-semibold text-gray-700">Resources:</h4>
                    <ul className="list-disc list-inside text-sm text-gray-600 mt-1 space-y-1">
                        {item.resources?.article && <li><strong>Article:</strong> <a href={item.resources.article} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{item.resources.article}</a></li>}
                        {item.resources?.video && <li><strong>Video:</strong> <a href={item.resources.video} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{item.resources.video}</a></li>}
                        {item.resources?.practice && <li><strong>Practice:</strong> <a href={item.resources.practice} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{item.resources.practice}</a></li>}
                    </ul>
                </div>
                {explanation && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-bold text-gray-800">✨ AI Explanation</h4>
                        <p className="text-gray-700 text-sm mt-2 whitespace-pre-wrap">{explanation}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const Chatbot = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([{ sender: 'ai', text: 'Hello! Ask me for help with any DSA topic.' }]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        setMessages(prev => [...prev, { sender: 'user', text: userInput }]);
        const currentInput = userInput;
        setUserInput('');
        setIsLoading(true);
        try {
            const prompt = `You are a friendly DSA assistant. The user is asking: "${currentInput}". Provide a concise and helpful answer.`;
            const aiResponse = await callGeminiAPI(prompt);
            setMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);
        } catch (error) {
            setMessages(prev => [...prev, { sender: 'ai', text: `Sorry, I ran into an error: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <button onClick={() => setIsOpen(!isOpen)} className="fixed bottom-6 right-6 bg-blue-600 text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 z-50" aria-label="Toggle Chatbot">
                {isOpen ? <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
            </button>
            {isOpen && (
                <div className="fixed bottom-24 right-6 w-80 h-[28rem] bg-white rounded-xl shadow-2xl flex flex-col z-40 transition-all duration-300 ease-in-out">
                    <div className="bg-blue-600 text-white p-4 rounded-t-xl"><h3 className="font-bold text-lg">✨ Rishu AI Assistant</h3></div>
                    <div className="flex-1 p-4 overflow-y-auto">
                        {messages.map((msg, index) => <div key={index} className={`flex mb-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`px-4 py-2 rounded-lg max-w-xs break-words ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>{msg.text}</div></div>)}
                        {isLoading && <div className="flex justify-start"><div className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800">Thinking...</div></div>}
                        <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200">
                        <div className="flex">
                            <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="Ask about a DSA topic..." className="flex-1 p-2 border border-gray-300 rounded-l-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" disabled={isLoading}/>
                            <button type="submit" className="bg-blue-600 text-white px-4 rounded-r-md hover:bg-blue-700 disabled:bg-blue-300" disabled={isLoading}>Send</button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
};

const Compiler = () => {
  const [languageId, setLanguageId] = useState(54); // default: C++ (GCC 9.2.0)
  const [code, setCode] = useState(`#include <bits/stdc++.h>
using namespace std;
int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isExplainLoading, setIsExplainLoading] = useState(false);

  const languageMap = {
      54: "C++",
      52: "C",
      71: "Python",
      63: "JavaScript"
  };

  const handleExplainCode = async () => {
    setIsExplainLoading(true);
    setExplanation('');
    try {
        const languageName = languageMap[languageId];
        const prompt = `Explain the following ${languageName} code line by line, identify potential bugs, and suggest improvements:\n\n\`\`\`${languageName}\n${code}\n\`\`\``;
        const response = await callGeminiAPI(prompt);
        setExplanation(response);
    } catch (error) {
        setExplanation(`Error fetching explanation: ${error.message}`);
    } finally {
        setIsExplainLoading(false);
    }
  };

  const runCode = async () => {
    setIsRunning(true);
    setOutput("Running...");

    try {
      const { data } = await axios.post(
        "https://ce.judge0.com/submissions?base64_encoded=false&wait=true",
        {
          source_code: code,
          language_id: languageId,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const result =
        data.stdout || data.stderr || data.compile_output || "No output";
      setOutput(result);
    } catch (err) {
      console.error("Judge0 Error:", err.response?.data || err.message);
      setOutput("Error: " + (err.response?.data?.message || err.message));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg h-full flex flex-col">
      <h2 className="text-3xl font-bold mb-4 text-gray-800">
        Code Editor & Compiler
      </h2>

      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          <button onClick={() => setLanguageId(54)} className={`${languageId === 54 ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"} whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm`}>C++</button>
          <button onClick={() => setLanguageId(52)} className={`${languageId === 52 ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"} whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm`}>C</button>
          <button onClick={() => setLanguageId(71)} className={`${languageId === 71 ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"} whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm`}>Python</button>
          <button onClick={() => setLanguageId(63)} className={`${languageId === 63 ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"} whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm`}>JavaScript</button>
        </nav>
      </div>

      <textarea rows={12} value={code} onChange={(e) => setCode(e.target.value)} className="w-full flex-grow p-3 bg-black text-green-400 font-mono rounded-lg border border-gray-700"/>

      <div className="flex items-center space-x-4 mt-4">
        <button onClick={runCode} disabled={isRunning} className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50">
            {isRunning ? "Running..." : "▶ Run Code"}
        </button>
        <button onClick={handleExplainCode} disabled={isExplainLoading} className="px-6 py-2 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 disabled:opacity-50">
            ✨ {isExplainLoading ? "Analyzing..." : "Explain Code with AI"}
        </button>
      </div>

      <h3 className="text-lg font-semibold mt-6 text-gray-800">Output:</h3>
      <pre className="bg-black text-white p-4 rounded mt-2 overflow-x-auto">
        {output}
      </pre>
      {explanation && (
        <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-800">✨ AI Code Explanation:</h3>
            <div className="bg-gray-100 text-gray-800 p-4 rounded mt-2 overflow-x-auto whitespace-pre-wrap">
                {explanation}
            </div>
        </div>
      )}
    </div>
  );
};

const TimetablePlanner = ({ user }) => {
    const [allTopics, setAllTopics] = useState([]);
    const [selectedTopics, setSelectedTopics] = useState([]);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 29); return d.toISOString().split('T')[0]; });
    const [timetable, setTimetable] = useState([]);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [permissionError, setPermissionError] = useState(false);
    const [isGeneratingInitialTopics, setIsGeneratingInitialTopics] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    const securityRulesText = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public topics collection
    match /artifacts/{appId}/public/data/topics/{topicId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == 'REPLACE_WITH_YOUR_ADMIN_GOOGLE_UID';
    }

    // Public users collection for the dashboard
    match /artifacts/{appId}/public/data/users/{userId} {
      allow read: if request.auth != null && request.auth.uid == 'REPLACE_WITH_YOUR_ADMIN_GOOGLE_UID';
      allow create: if request.auth != null && request.auth.uid == userId;
    }

    // User-specific timetables
    match /artifacts/{appId}/users/{userId}/timetable/{timetableId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`;

    useEffect(() => {
        const topicsCollection = collection(db, `artifacts/${appId}/public/data/topics`);
        
        const unsubscribe = onSnapshot(topicsCollection, async (snapshot) => {
            setPermissionError(false);
            if (snapshot.empty) {
                console.log("No topics found in Firestore. Generating with AI.");
                setIsGeneratingInitialTopics(true);
                try {
                    const prompt = "You are a DSA expert. Generate a list of 10 fundamental Data Structures and Algorithms topics for a beginner. The output must be a valid JSON array of objects. Each object must have keys: 'name' (string), 'duration' (integer representing days), and 'difficulty' (string: 'Easy', 'Medium', or 'Hard').";
                    const schema = { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, duration: { type: "NUMBER" }, difficulty: { type: "STRING" } }, required: ["name", "duration", "difficulty"] } };
                    
                    const jsonString = await callGeminiAPI(prompt, true, schema);
                    const generatedTopics = JSON.parse(jsonString);

                    const batch = writeBatch(db);
                    generatedTopics.forEach(topic => {
                        const docRef = doc(collection(db, `artifacts/${appId}/public/data/topics`));
                        batch.set(docRef, topic);
                    });
                    await batch.commit();
                    
                } catch (e) {
                    console.error("Failed to generate or save initial topics:", e);
                    setError("Could not generate initial topics with AI. Please check your API key and try again.");
                    setAllTopics([]);
                } finally {
                    setIsGeneratingInitialTopics(false);
                }
            } else {
                const topicsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAllTopics(topicsData);
            }
        }, (err) => {
            console.error("Error fetching topics:", err);
            if (err.code === 'permission-denied') {
                setPermissionError(true);
            } else {
                setError("Could not fetch topics. An unknown error occurred.");
                setAllTopics([]);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) return;
        const timetableCollection = collection(db, `artifacts/${appId}/users/${user.uid}/timetable`);
        const q = query(timetableCollection, orderBy("order"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const timetableData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTimetable(timetableData);
        }, (err) => {
            console.error("Error fetching timetable:", err);
            setError("Could not fetch your timetable. Please check your Firestore security rules.");
        });
        return () => unsubscribe();
    }, [user]);

    const generateAITimetable = async () => {
        if (selectedTopics.length === 0) { setError('Please select at least one topic.'); return; }
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        if (days <= 0) { setError("End date must be after start date."); return; }

        setError(''); setIsLoading(true);
        
        const existingTimetable = await getDocs(collection(db, `artifacts/${appId}/users/${user.uid}/timetable`));
        const deleteBatch = writeBatch(db);
        existingTimetable.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();

        try {
            const topicDetails = selectedTopics.map(t => `${t.name} (Difficulty: ${t.difficulty}, Estimated Duration: ${t.duration} days)`).join('; ');
            const prompt = `You are a DSA expert. Create a study plan from ${startDate} to ${endDate} (${days} days) for ONLY these topics: ${topicDetails}. Do not include any other topics besides the ones listed. The output must be a valid JSON array of objects. Each object must have "date", "topic", "goal", "what", "how", and a "resources" object with "articles from githubs, geekforgeeks or other sources", "search on youtube links ", and "practice links from geekforgeeks or leetcode" keys. Arrange topics logically. Fill all ${days} days, using only the provided topics and adding revision sessions where appropriate.`;
            const schema = { type: "ARRAY", items: { type: "OBJECT", properties: { date: { type: "STRING" }, topic: { type: "STRING" }, goal: { type: "STRING" }, what: { type: "STRING" }, how: { type: "STRING" }, resources: { type: "OBJECT", properties: { article: { type: "STRING" }, video: { type: "STRING" }, practice: { type: "STRING" } } } }, required: ["date", "topic", "goal", "what", "how", "resources"] } };
            
            const jsonString = await callGeminiAPI(prompt, true, schema);
            const parsedResponse = JSON.parse(jsonString);

            const addBatch = writeBatch(db);
            parsedResponse.forEach((item, index) => {
                const docRef = doc(collection(db, `artifacts/${appId}/users/${user.uid}/timetable`));
                addBatch.set(docRef, { ...item, completed: false, order: index });
            });
            await addBatch.commit();

        } catch (e) {
            console.error(e);
            setError(`Error: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleToggleComplete = async (itemId, isCompleted) => {
        if (!user) return;
        const itemRef = doc(db, `artifacts/${appId}/users/${user.uid}/timetable`, itemId);
        await updateDoc(itemRef, { completed: isCompleted });
    };

    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    
    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            const oldIndex = timetable.findIndex((item) => item.id === active.id);
            const newIndex = timetable.findIndex((item) => item.id === over.id);
            const newTimetable = arrayMove(timetable, oldIndex, newIndex);
            setTimetable(newTimetable);
            
            const batch = writeBatch(db);
            newTimetable.forEach((item, index) => {
                const docRef = doc(db, `artifacts/${appId}/users/${user.uid}/timetable`, item.id);
                batch.update(docRef, { order: index });
            });
            await batch.commit().catch(err => {
                console.error("Error updating order:", err);
                setError("Could not save the new order. Please try again.");
                setTimetable(timetable);
            });
        }
    };

    const handleResetTimetable = async () => {
        if (!user) return;
        setError('');
        try {
            const existingTimetable = await getDocs(collection(db, `artifacts/${appId}/users/${user.uid}/timetable`));
            const deleteBatch = writeBatch(db);
            existingTimetable.forEach(doc => deleteBatch.delete(doc.ref));
            await deleteBatch.commit();
        } catch (e) {
            console.error("Error resetting timetable:", e);
            setError("Could not reset the timetable. Please try again.");
        }
    };

    const handleDeleteTopic = async (topicId) => {
        if (user && user.uid === ADMIN_UID) {
            try {
                await deleteDoc(doc(db, `artifacts/${appId}/public/data/topics`, topicId));
            } catch (e) {
                console.error("Error deleting topic:", e);
                setError("Could not delete the topic.");
            }
        }
    };

    const filteredTopics = allTopics.filter(topic => topic.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const today = new Date().toISOString().split('T')[0];
    const todaysTopic = timetable.find(item => item.date === today);

    if (permissionError) {
        return (
            <div className="bg-red-50 border-l-4 border-red-400 p-6 rounded-md shadow-lg">
                <div className="flex">
                    <div>
                        <p className="text-xl font-bold text-red-800">Action Required: Update Firestore Security Rules</p>
                        <div className="text-red-700 mt-3">
                            <p className="mb-3">The app can't access the topic list due to restrictive database rules. To fix this, please update them in your Firebase project.</p>
                            <ol className="list-decimal list-inside space-y-1.5">
                                <li>Go to your <strong>Firebase Console</strong>.</li>
                                <li>Navigate to <strong>Firestore Database &gt; Rules</strong> tab.</li>
                                <li>Delete the existing rules and paste the code below:</li>
                            </ol>
                            <pre className="bg-gray-800 text-white p-4 rounded-md mt-3 text-xs overflow-x-auto">
                                <code>
                                    {securityRulesText}
                                </code>
                            </pre>
                             <p className="mt-3 text-sm"><strong>Note:</strong> Remember to replace the placeholder in the <strong>allow write</strong> rule with your actual Admin Google UID if you plan to use the admin panel.</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {todaysTopic && (
                <div className="mb-8 bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-500">
                    <h2 className="text-2xl font-bold text-gray-800">Today's Focus: {todaysTopic.topic}</h2>
                    <p className="text-gray-600 mt-2">{todaysTopic.goal}</p>
                </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg h-fit">
                    <h2 className="text-2xl font-semibold mb-4 text-gray-700">1. Configure Your Plan</h2>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                            <input type="date" id="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"/>
                        </div>
                        <div>
                            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                            <input type="date" id="endDate" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"/>
                        </div>
                    </div>
                    <h2 className="text-2xl font-semibold mb-4 text-gray-700">2. Select Topics</h2>
                    <input 
                        type="text" 
                        placeholder="Search topics..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-2 mb-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-2 -mr-2">
                        {isGeneratingInitialTopics ? (
                            <div className="text-center p-4">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                <p className="mt-2 text-gray-600">Generating initial topics with AI...</p>
                            </div>
                        ) : (
                            filteredTopics.map(topic => <TopicItem key={topic.id} topic={topic} onSelect={(topic) => setSelectedTopics(prev => prev.find(t => t.id === topic.id) ? prev.filter(t => t.id !== topic.id) : [...prev, topic])} isSelected={selectedTopics.some(t => t.id === topic.id)} user={user} onDelete={handleDeleteTopic} />)
                        )}
                    </div>
                    <div className="mt-6 space-y-3">
                        <button onClick={generateAITimetable} disabled={isLoading} className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all duration-300 shadow-md disabled:opacity-50 flex items-center justify-center">
                            ✨ Generate with AI
                        </button>
                        <button onClick={handleResetTimetable} disabled={isLoading} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition-all duration-300 shadow-md disabled:opacity-50">
                            Reset Plan
                        </button>
                    </div>
                    {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                </div>
                <div className="lg:col-span-2">
                    <h2 className="text-3xl font-bold mb-6 text-gray-800">Your Personalized Timetable</h2>
                    {isLoading && <div className="text-center p-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div><p className="mt-4 text-gray-600">AI is generating your plan...</p></div>}
                    
                    {timetable.length > 0 ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={timetable.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                {timetable.map((item, index) => <SortableTimetableItem key={item.id} id={item.id} item={item} index={index} onToggleComplete={handleToggleComplete} />)}
                            </SortableContext>
                        </DndContext>
                    ) : !isLoading && (
                        <div className="bg-white p-10 rounded-xl shadow-lg text-center"><h3 className="mt-2 text-sm font-medium text-gray-900">No timetable generated yet</h3><p className="mt-1 text-sm text-gray-500">Select your topics and use the AI generator to create a plan.</p></div>
                    )}
                </div>
            </div>
        </>
    );
};

const UserDashboard = () => {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const usersCollection = collection(db, `artifacts/${appId}/public/data/users`);
        const unsubscribe = onSnapshot(usersCollection, async (snapshot) => {
            const usersData = await Promise.all(snapshot.docs.map(async (userDoc) => {
                const userData = userDoc.data();
                const timetableCollection = collection(db, `artifacts/${appId}/users/${userDoc.id}/timetable`);
                const timetableSnapshot = await getDocs(timetableCollection);
                const total = timetableSnapshot.size;
                const completed = timetableSnapshot.docs.filter(doc => doc.data().completed).length;
                return {
                    ...userData,
                    progress: { total, completed }
                };
            }));
            setUsers(usersData);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (isLoading) {
        return <div className="text-center p-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div></div>;
    }

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            <h2 className="text-3xl font-bold mb-6 text-gray-800">User Dashboard</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map(user => (
                            <tr key={user.uid}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.displayName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {user.progress.total > 0 ? `${user.progress.completed} / ${user.progress.total} topics completed` : 'No plan generated'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


const AdminPage = () => {
    const [adminView, setAdminView] = useState('addTopic');

    const AddTopicForm = () => {
        const [topicName, setTopicName] = useState('');
        const [isLoading, setIsLoading] = useState(false);
        const [error, setError] = useState('');
        const [success, setSuccess] = useState('');
    
        const handleAddTopic = async (e) => {
            e.preventDefault();
            if (!topicName.trim()) { setError("Topic name cannot be empty."); return; }
            
            setIsLoading(true); setError(''); setSuccess('');
            try {
                const prompt = `Generate a detailed learning plan for the topic: "${topicName}". The output must be a valid JSON object with keys: "name", "duration" (an integer), "difficulty" ("Easy", "Medium", or "Hard"). Just generate these 3 fields.`;
                const schema = { type: "OBJECT", properties: { name: { type: "STRING" }, duration: { type: "NUMBER" }, difficulty: { type: "STRING" } }, required: ["name", "duration", "difficulty"] };
                
                const jsonString = await callGeminiAPI(prompt, true, schema);
                let newTopic;
                try {
                    newTopic = JSON.parse(jsonString);
                } catch (parseError) {
                    console.error("AI returned invalid JSON:", jsonString);
                    throw new Error("The AI returned an invalid response. Please try rephrasing your topic.");
                }
    
                await addDoc(collection(db, `artifacts/${appId}/public/data/topics`), newTopic);
                setSuccess(`Successfully added topic: ${newTopic.name}`);
                setTopicName('');
            } catch (e) {
                console.error(e);
                setError(`Error adding topic: ${e.message}`);
            } finally {
                setIsLoading(false);
            }
        };
    
        return (
            <div className="bg-white p-8 rounded-xl shadow-lg">
                <h2 className="text-3xl font-bold mb-6 text-gray-800">Add New Topic</h2>
                <form onSubmit={handleAddTopic}>
                    <div className="mb-4">
                        <label htmlFor="topicName" className="block text-sm font-medium text-gray-700 mb-2">New Topic Name (e.g., OOPS)</label>
                        <input type="text" id="topicName" value={topicName} onChange={(e) => setTopicName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" placeholder="Object-Oriented Programming"/>
                    </div>
                    <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white font-bold py-3 px-4 rounded-lg hover:from-green-600 hover:to-teal-600 transition-all duration-300 shadow-md disabled:opacity-50">
                        {isLoading ? 'Generating with AI...' : '✨ Add Topic with AI'}
                    </button>
                    {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                    {success && <p className="text-green-500 text-sm mt-4">{success}</p>}
                </form>
            </div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-6 border-b border-gray-200">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button onClick={() => setAdminView('addTopic')} className={`${adminView === 'addTopic' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-lg`}>Add Topic</button>
                    <button onClick={() => setAdminView('dashboard')} className={`${adminView === 'dashboard' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-lg`}>Dashboard</button>
                </nav>
            </div>
            {adminView === 'addTopic' ? <AddTopicForm /> : <UserDashboard />}
        </div>
    );
};

// --- Main App Component ---
export default function App() {
    const [activeView, setActiveView] = useState('planner');
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            // Create a user profile in Firestore if it doesn't exist
            const userDocRef = doc(db, `artifacts/${appId}/public/data/users`, user.uid);
            const docSnap = await getDoc(userDocRef);
            if (!docSnap.exists()) {
                await setDoc(userDocRef, {
                    displayName: user.displayName,
                    email: user.email,
                    uid: user.uid
                });
            }
        } catch (error) {
            console.error("Google sign-in error:", error.message);
        }
    };
    
    const handleGuestLogin = () => {
        signInAnonymously(auth).catch(error => {
            console.error("Anonymous sign-in error:", error.message);
        });
    };

    const handleLogout = () => {
        signOut(auth);
    };

    if (authLoading) {
        return <div className="flex justify-center items-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <header className="bg-white shadow-sm sticky top-0 z-30">
                <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">DSA Prep Hub</h1>
                        <p className="text-gray-600 mt-1">Your all-in-one DSA preparation toolkit.</p>
                    </div>
                    <div className="flex items-center space-x-4">
                        {user ? (
                            <>
                                <nav className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                                    <button onClick={() => setActiveView('planner')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'planner' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>Planner</button>
                                    <button onClick={() => setActiveView('compiler')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'compiler' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>Compiler</button>
                                    {!user.isAnonymous && user.uid === ADMIN_UID && <button onClick={() => setActiveView('admin')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'admin' ? 'bg-white text-red-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>Admin</button>}
                                </nav>
                                { user.photoURL ? 
                                    <img src={user.photoURL} alt="User profile" className="w-10 h-10 rounded-full" /> :
                                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold">{user.isAnonymous ? 'G' : user.email?.charAt(0).toUpperCase()}</div>
                                }
                                <button onClick={handleLogout} className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors">Logout</button>
                            </>
                        ) : (
                             <div className="flex items-center space-x-4">
                                <button onClick={handleLogin} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">Login with Google</button>
                                <button onClick={handleGuestLogin} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors">Continue as Guest</button>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            
            <main className="container mx-auto px-4 py-8">
                {!user ? (
                    <div className="text-center bg-white p-12 rounded-xl shadow-lg max-w-2xl mx-auto">
                        <h2 className="text-3xl font-bold text-gray-800">Welcome to DSA Prep Hub!</h2>
                        <p className="mt-4 text-gray-600 text-lg">Your personal AI-powered planner to master Data Structures and Algorithms.</p>
                         <div className="flex justify-center items-center space-x-4 mt-8">
                            <button onClick={handleLogin} className="bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg">Login with Google</button>
                            <button onClick={handleGuestLogin} className="bg-gray-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors shadow-md hover:shadow-lg">Continue as Guest</button>
                         </div>
                    </div>
                ) : (
                    <>
                        {activeView === 'planner' && <TimetablePlanner user={user} />}
                        {activeView === 'compiler' && <Compiler />}
                        {activeView === 'admin' && !user.isAnonymous && user.uid === ADMIN_UID && <AdminPage />}
                        {activeView === 'admin' && (user.isAnonymous || user.uid !== ADMIN_UID) && <p className="text-center text-red-500">You do not have administrative access.</p>}
                    </>
                )}
            </main>
            
            {user && <Chatbot />}
        </div>
    );
}
