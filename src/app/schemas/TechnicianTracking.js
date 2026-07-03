const mongoose = require('mongoose');

const TrackingPointSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: true,
    min: -90,
    max: 90,
  },
  longitude: {
    type: Number,
    required: true,
    min: -180,
    max: 180,
  },
  accuracy: {
    type: Number,
    default: null,
  },
  speed: {
    type: Number,
    default: null,
  },
  heading: {
    type: Number,
    default: null,
  },
  battery_level: {
    type: Number,
    default: null,
  },
  source: {
    type: String,
    default: 'mobile-app',
  },
  recorded_at: {
    type: Date,
    default: Date.now,
  },
}, {
  _id: false,
});

const TechnicianTrackingSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  technician_login: {
    type: String,
    required: true,
    trim: true,
  },
  technician_name: {
    type: String,
    default: '',
    trim: true,
  },
  employee_id: {
    type: String,
    default: '',
    trim: true,
  },
  last_location: {
    type: TrackingPointSchema,
    required: false,
    default: null,
  },
  path: {
    type: [TrackingPointSchema],
    default: [],
  },
  last_seen_at: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'technician_tracking',
});

TechnicianTrackingSchema.index({ tenant_id: 1, technician_login: 1 }, { unique: true });

module.exports = mongoose.model('TechnicianTracking', TechnicianTrackingSchema);
