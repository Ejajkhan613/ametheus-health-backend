// passport-setup.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userModel');
const jwt = require('jsonwebtoken');

// Configure Passport to use Google Strategy
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: '/auth/google/callback',
        },
        async (accessToken, refreshToken, profile, done) => {
            // Check if user already exists in our db
            const existingUser = await User.findOne({ googleId: profile.id });
            if (existingUser) {
                // User already exists
                existingUser.isNewUser = false;
                return done(null, existingUser);
            }

            // If not, create a new user in our db
            const newUser = new User({
                googleId: profile.id,
                name: profile.displayName,
                email: profile.emails[0].value,
                avatar: profile._json.picture,
                authMethod: 'google',
                isNewUser: true // Set this flag for new users
            });

            await newUser.save();
            done(null, newUser);
        }
    )
);

// Serialize user ID to session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user ID from session
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});