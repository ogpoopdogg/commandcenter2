// Initialize Firebase
firebase.initializeApp({
    apiKey: "AIzaSyAKmgoXA4m3cRTmxJq4aUyva5SVvFbTNqg",
    authDomain: "eandccourier-36fcc.firebaseapp.com",
    databaseURL: "https://eandccourier-36fcc-default-rtdb.firebaseio.com",
    projectId: "eandccourier-36fcc",
    messagingSenderId: "1067680083511", 
    appId: "1:1067680083511:android:22d1eb3757302492bd19b2" 
});

// Create global variables for use in app.js
const db = firebase.database();
const messaging = firebase.messaging();
