/**
 * UserPreference Model
 * 
 * This model represents user-specific preferences and settings.
 * It is used to store and manage user settings such as notification preferences
 * and theme preferences (e.g., dark mode).
 * 
 * The model is designed to be unique per user, identified by the userId.
 */

import mongoose from 'mongoose';

const userPreferenceSchema = new mongoose.Schema({
  /**
   * @field userId
   * @type {String}
   * @desc Unique identifier for the user. This field is required and must be unique
   * across all user preferences to ensure each user has a distinct set of preferences.
   */
  userId: {
    type: String,
    required: true,
    unique: true
  },
  /**
   * @field settings
   * @type {Object}
   * @desc Stores user-specific settings. Includes preferences for notifications
   * and theme (dark mode).
   */
  settings: {
    /**
     * @field notifications
     * @type {Boolean}
     * @desc Indicates whether the user has enabled notifications. Defaults to true.
     */
    notifications: {
      type: Boolean,
      default: true
    },
    /**
     * @field darkMode
     * @type {Boolean}
     * @desc Indicates whether the user prefers dark mode. Defaults to false.
     */
    darkMode: {
      type: Boolean,
      default: false
    }
  },
  /**
   * @field lastActive
   * @type {Date}
   * @desc Records the last active timestamp for the user. Defaults to the current date and time.
   */
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  /**
   * @option timestamps
   * @desc Automatically adds createdAt and updatedAt fields to the schema.
   * These fields are managed by Mongoose and provide timestamps for when
   * the document was created and last updated.
   */
  timestamps: true
});

/**
 * @desc Exports the UserPreference model. If the model already exists, it uses the existing model.
 * This prevents overwriting the model when the file is imported multiple times.
 */
const UserPreference = mongoose.models.UserPreference || mongoose.model('UserPreference', userPreferenceSchema);

export default UserPreference;
