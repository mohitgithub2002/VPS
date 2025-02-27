# Teacher Diary Note API Documentation

## POST /api/teacher/dairy/addnote

Allows teachers to create new diary notes/notifications for students.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | The title of the diary note |
| message | string | Yes | The content of the diary note |
| type | string | Yes | Type of notification ('personal' or 'general') |
| student_id | array | Conditional | Required only when type is 'personal'. Array of student IDs |

### Example Request

```json
{
  "title": "Homework Reminder",
  "message": "Please complete Math exercises for Chapter 5",
  "type": "personal",
  "student_id": ["student123", "student456"]
}
```

### Success Response

**Status Code:** 201 Created

```json
{
  "message": "Diary note added successfully",
  "notification": {
    "type": "personal",
    "title": "Homework Reminder",
    "message": "Please complete Math exercises for Chapter 5",
    "student_id": ["student123", "student456"],
    "_id": "..."
  }
}
```

### Error Responses

#### Missing Required Fields
**Status Code:** 400 Bad Request
```json
{
  "error": "Missing required fields"
}
```

#### Missing Student ID for Personal Notification
**Status Code:** 400 Bad Request
```json
{
  "error": "Student ID is required for personal notifications"
}
```

#### Server Error
**Status Code:** 500 Internal Server Error
```json
{
  "error": "Failed to add diary note"
}
```

### Notes

- For general notifications, set `type` as "general" and omit the `student_id` field
- For personal notifications, `student_id` must be an array of valid student IDs
- The API requires proper authentication (not shown in examples)
- All timestamps are automatically added by the system

### Security

- This endpoint should only be accessible to authenticated teachers
- Implement proper input sanitization on the client side
- Validate student IDs against the school database
