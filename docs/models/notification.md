# School Notification System Documentation

## 1. Model Overview
The notification system enables communication between school staff and students through a flexible MongoDB schema.

### 1.1 Key Features
- Two-tier notification system (broadcast/personal)
- Real-time creation and delivery
- Efficient pagination and querying
- Student-specific targeting
- Automatic timestamp management

## 2. Technical Specifications

### 2.1 MongoDB Schema

The notification model handles both broadcast and personal notifications in the school management system.

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | String | Yes | Either 'broadcast' or 'personal' |
| title | String | Yes | Title of the notification |
| message | String | Yes | Content of the notification |
| student_id | [String] | Conditional | Required for personal notifications |
| created_at | Date | Auto | Automatically set on creation |

#### Indexes
- `created_at`: -1 (Descending order for latest first)
- `student_id` and `created_at`: For efficient querying of student notifications

#### Validation
- Personal notifications must have at least one student ID
- Broadcast notifications can have empty student_id array
- Title and message are trimmed of whitespace
- Type is validated against enum values

### Usage Example
