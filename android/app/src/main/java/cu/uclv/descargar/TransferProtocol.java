package cu.uclv.descargar;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.concurrent.ThreadLocalRandom;

/** Pure HTTP range and validator checks, kept separate so they can run as local JVM tests. */
final class TransferProtocol {
    private static final Pattern CONTENT_RANGE = Pattern.compile("bytes\\s+(\\d+)-(\\d+)/(\\d+|\\*)", Pattern.CASE_INSENSITIVE);

    static long rangeStart(String value) { Matcher matcher = match(value); return matcher == null ? -1 : parse(matcher.group(1)); }
    static long rangeEnd(String value) { Matcher matcher = match(value); return matcher == null ? -1 : parse(matcher.group(2)); }
    static long rangeTotal(String value) {
        Matcher matcher = match(value);
        return matcher == null || "*".equals(matcher.group(3)) ? -1 : parse(matcher.group(3));
    }
    static long unsatisfiedTotal(String value) {
        if (value == null || !value.toLowerCase(Locale.ROOT).startsWith("bytes */")) return -1;
        return parse(value.substring(8));
    }
    static boolean startsAt(String contentRange, long offset) { return rangeStart(contentRange) == offset; }
    static boolean validatorMatches(String oldEtag, String oldModified, String newEtag, String newModified) {
        if (oldEtag != null) return oldEtag.equals(newEtag);
        if (oldModified != null) return oldModified.equals(newModified);
        return false;
    }

    static long downloadRetryDelay(int retryNumber) {
        long[] baseDelays = {15_000L, 60_000L, 180_000L};
        long base = baseDelays[Math.max(0, Math.min(retryNumber - 1, baseDelays.length - 1))];
        return Math.round(base * ThreadLocalRandom.current().nextDouble(0.8, 1.2));
    }

    static boolean retryableStatus(int status) {
        return status == 408 || status == 425 || status == 429 || status >= 500;
    }

    private static Matcher match(String value) {
        Matcher matcher = CONTENT_RANGE.matcher(value == null ? "" : value.trim());
        return matcher.matches() ? matcher : null;
    }
    private static long parse(String value) { try { return Long.parseLong(value); } catch (RuntimeException error) { return -1; } }
    private TransferProtocol() {}
}
