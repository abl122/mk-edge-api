const TechnicianTracking = require('../schemas/TechnicianTracking');
const logger = require('../../logger');

const MAX_POINTS_PER_TECHNICIAN = 500;

function toNumber(value) {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseDateRange(dateStr) {
  if (!dateStr) {
    return null;
  }

  const raw = String(dateStr).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const start = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start.getTime() + (24 * 60 * 60 * 1000));
  return { start, end, raw };
}

function toLimit(value, fallback, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

class TrackingController {
  async updateLocation(req, res) {
    try {
      const tenantId = req.tenant_id;
      const latitude = toNumber(req.body?.latitude);
      const longitude = toNumber(req.body?.longitude);
      const accuracy = toNumber(req.body?.accuracy);
      const speed = toNumber(req.body?.speed);
      const heading = toNumber(req.body?.heading);
      const batteryLevel = toNumber(req.body?.battery_level);
      const recordedAt = toDate(req.body?.recorded_at);

      const technicianLogin = String(
        req.body?.technician_login || req.user?.login || ''
      ).trim();
      const technicianName = String(req.body?.technician_name || req.user?.nome || '').trim();
      const employeeId = String(req.body?.employee_id || '').trim();

      if (!technicianLogin) {
        return res.status(400).json({ error: 'technician_login é obrigatório' });
      }

      if (latitude === null || longitude === null) {
        return res.status(400).json({ error: 'latitude e longitude são obrigatórios' });
      }

      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'latitude/longitude inválidos' });
      }

      const point = {
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
        battery_level: batteryLevel,
        source: 'mobile-app',
        recorded_at: recordedAt,
      };

      await TechnicianTracking.findOneAndUpdate(
        {
          tenant_id: tenantId,
          technician_login: technicianLogin,
        },
        {
          $set: {
            technician_name: technicianName,
            employee_id: employeeId,
            last_location: point,
            last_seen_at: recordedAt,
          },
          $setOnInsert: {
            tenant_id: tenantId,
            technician_login: technicianLogin,
          },
          $push: {
            path: {
              $each: [point],
              $slice: -MAX_POINTS_PER_TECHNICIAN,
            },
          },
        },
        { upsert: true, new: true }
      );

      return res.json({
        success: true,
        message: 'Localização recebida',
        technician_login: technicianLogin,
        recorded_at: recordedAt,
      });
    } catch (error) {
      logger.error('[Tracking.updateLocation] Erro ao atualizar localização', {
        error: error.message,
        tenant_id: req.tenant_id,
      });

      return res.status(500).json({
        error: 'Erro ao salvar localização do técnico',
      });
    }
  }

  async listTechnicians(req, res) {
    try {
      const minutes = toLimit(req.query?.minutes, 120, 24 * 60);
      const limit = toLimit(req.query?.limit, 50, 500);
      const dateRange = parseDateRange(req.query?.date);
      const since = new Date(Date.now() - minutes * 60 * 1000);
      const seenFilter = dateRange
        ? { $gte: dateRange.start, $lt: dateRange.end }
        : { $gte: since };

      const rows = await TechnicianTracking.find({
        tenant_id: req.tenant_id,
        last_seen_at: seenFilter,
      })
        .sort({ last_seen_at: -1 })
        .limit(limit)
        .lean();

      const technicians = rows.map((row) => ({
        technician_login: row.technician_login,
        technician_name: row.technician_name,
        employee_id: row.employee_id,
        last_seen_at: row.last_seen_at,
        last_location: row.last_location,
      }));

      return res.json({
        success: true,
        date: dateRange ? dateRange.raw : null,
        minutes,
        count: technicians.length,
        technicians,
      });
    } catch (error) {
      logger.error('[Tracking.listTechnicians] Erro ao listar técnicos', {
        error: error.message,
        tenant_id: req.tenant_id,
      });

      return res.status(500).json({
        error: 'Erro ao listar técnicos rastreados',
      });
    }
  }

  async showTechnician(req, res) {
    try {
      const technicianLogin = decodeURIComponent(String(req.params.login || '')).trim();
      const minutes = toLimit(req.query?.minutes, 180, 24 * 60);
      const pointLimit = toLimit(req.query?.point_limit || req.query?.limit, 300, 1000);
      const dateRange = parseDateRange(req.query?.date);
      const since = new Date(Date.now() - minutes * 60 * 1000);

      if (!technicianLogin) {
        return res.status(400).json({ error: 'login do técnico é obrigatório' });
      }

      const row = await TechnicianTracking.findOne({
        tenant_id: req.tenant_id,
        technician_login: technicianLogin,
      }).lean();

      if (!row) {
        return res.json({
          success: true,
          technician_login: technicianLogin,
          technician_name: '',
          points: [],
          last_location: null,
        });
      }

      const points = (Array.isArray(row.path) ? row.path : [])
        .filter((point) => {
          const recordedAt = point?.recorded_at ? new Date(point.recorded_at) : null;
          if (!recordedAt || Number.isNaN(recordedAt.getTime())) {
            return false;
          }
          if (dateRange) {
            return recordedAt >= dateRange.start && recordedAt < dateRange.end;
          }
          return recordedAt >= since;
        })
        .slice(-pointLimit);

      return res.json({
        success: true,
        technician_login: row.technician_login,
        technician_name: row.technician_name,
        employee_id: row.employee_id,
        last_seen_at: row.last_seen_at,
        last_location: row.last_location,
        points,
      });
    } catch (error) {
      logger.error('[Tracking.showTechnician] Erro ao consultar rastreio', {
        error: error.message,
        tenant_id: req.tenant_id,
      });

      return res.status(500).json({
        error: 'Erro ao consultar rastreio do técnico',
      });
    }
  }
}

module.exports = new TrackingController();
