# Student Notification API Documentation

## GET /api/student/notification

Fetches notifications for a specific student, including both broadcast notifications (sent to all students) and personal notifications (sent to specific students).

### Query Parameters

| Parameter    | Type    | Required | Default | Description                                     |
|-------------|---------|----------|---------|------------------------------------------------|
| student_id  | string  | Yes      | -       | The unique identifier of the student           |
| page        | number  | No       | 1       | The page number for pagination                 |
| limit       | number  | No       | 10      | Number of notifications to return per page     |

### Response Format

```json
{
  "notifications": [
    {
      "_id": "string",
      "title": "string",
      "message": "string",
      "type": "broadcast" | "personal",
      "student_id": ["string"],
      "created_at": "datetime",
      "updated_at": "datetime"
    }
  ],
  "pagination": {
    "current_page": number,
    "total_pages": number,
    "total_notifications": number,
    "per_page": number
  }
}
```

### Response Fields

#### Notification Object

| Field       | Type     | Description                                                |
|-------------|----------|------------------------------------------------------------|
| _id         | string   | Unique identifier for the notification                     |
| title       | string   | Title of the notification                                  |
| message     | string   | Content of the notification                                |
| type        | string   | Type of notification ("broadcast" or "personal")           |
| student_id  | array    | Array of student IDs (for personal notifications)          |
| created_at  | datetime | Timestamp when the notification was created                |
| updated_at  | datetime | Timestamp when the notification was last updated           |

#### Pagination Object

| Field               | Type   | Description                                          |
|--------------------|--------|------------------------------------------------------|
| current_page       | number | Current page number                                  |
| total_pages        | number | Total number of pages available                      |
| total_notifications| number | Total count of notifications matching the query      |
| per_page          | number | Number of notifications per page                     |

### Status Codes

| Status Code | Description                                                           |
|-------------|-----------------------------------------------------------------------|
| 200         | Success - Returns notifications and pagination information              |
| 400         | Bad Request - Missing required student_id parameter                     |
| 500         | Internal Server Error - Something went wrong on the server             |

### Example Request

```bash
GET /api/student/notification?student_id=12345&page=1&limit=10
```

### Example Success Response

```json
{
  "notifications": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Holiday Notice",
      "message": "School will remain closed tomorrow due to heavy rain",
      "type": "broadcast",
      "student_id": [],
      "created_at": "2023-12-01T10:00:00Z",
      "updated_at": "2023-12-01T10:00:00Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 5,
    "total_notifications": 48,
    "per_page": 10
  }
}
```

### Error Responses

#### Missing Student ID
```json
{
  "error": "Student ID is required"
}
```

#### Server Error
```json
{
  "error": "Failed to fetch notifications"
}
