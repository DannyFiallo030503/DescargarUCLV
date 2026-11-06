package cu.uclv.descargar;

import org.junit.Test;
import static org.junit.Assert.*;

public class TransferProtocolTest {
    @Test public void parsesContentRangeAndChecksRequestedOffset() {
        String header = "bytes 1048576-2097151/9000000";
        assertEquals(1_048_576, TransferProtocol.rangeStart(header));
        assertEquals(2_097_151, TransferProtocol.rangeEnd(header));
        assertEquals(9_000_000, TransferProtocol.rangeTotal(header));
        assertTrue(TransferProtocol.startsAt(header, 1_048_576));
        assertFalse(TransferProtocol.startsAt(header, 1_048_575));
    }

    @Test public void rejectsMalformedOrUnknownRangeHeaders() {
        assertEquals(-1, TransferProtocol.rangeStart("bytes */9000"));
        assertEquals(-1, TransferProtocol.rangeTotal("bytes 1-4/*"));
        assertEquals(-1, TransferProtocol.rangeEnd(null));
    }

    @Test public void parsesUnsatisfiedRangeOnlyWhenWellFormed() {
        assertEquals(12_345, TransferProtocol.unsatisfiedTotal("bytes */12345"));
        assertEquals(-1, TransferProtocol.unsatisfiedTotal("items */12345"));
        assertEquals(-1, TransferProtocol.unsatisfiedTotal("bytes */nope"));
    }

    @Test public void requiresTheSameStoredValidatorToResume() {
        assertTrue(TransferProtocol.validatorMatches("\"v1\"", null, "\"v1\"", null));
        assertFalse(TransferProtocol.validatorMatches("\"v1\"", null, "\"v2\"", null));
        assertTrue(TransferProtocol.validatorMatches(null, "Tue, 03 Nov 2026 10:00:00 GMT", null, "Tue, 03 Nov 2026 10:00:00 GMT"));
        assertFalse(TransferProtocol.validatorMatches(null, null, "\"v1\"", null));
    }

    @Test public void retriesUseBoundedBackoffWithJitterAndTransientHttpStatuses() {
        assertTrue(TransferProtocol.downloadRetryDelay(1) >= 12_000L);
        assertTrue(TransferProtocol.downloadRetryDelay(1) <= 18_000L);
        assertTrue(TransferProtocol.downloadRetryDelay(2) >= 48_000L);
        assertTrue(TransferProtocol.downloadRetryDelay(2) <= 72_000L);
        assertTrue(TransferProtocol.retryableStatus(408));
        assertTrue(TransferProtocol.retryableStatus(429));
        assertTrue(TransferProtocol.retryableStatus(503));
        assertFalse(TransferProtocol.retryableStatus(404));
    }
}
