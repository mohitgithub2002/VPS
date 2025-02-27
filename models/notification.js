import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['broadcast', 'personal'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  student_id: {
    type: [String],
    required: function() {
      return this.type === 'personal';
    },
    default: [],
    validate: {
      validator: function(v) {
        return this.type === 'broadcast' || (Array.isArray(v) && v.length > 0);
      },
      message: 'Personal notifications must have at least one student ID'
    }
  }
}, {
  timestamps: { 
    createdAt: 'created_at',
    updatedAt: false 
  }
});

// Add index for faster queries
notificationSchema.index({ created_at: -1 });
notificationSchema.index({ student_id: 1, created_at: -1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

export default Notification;
