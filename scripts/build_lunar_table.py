"""Rebuilds the Chinese calendar table in src/lunar.ts (and the app's Lunar.kt) from the Hong Kong Observatory.

Downloads the Observatory's Gregorian-Lunar Calendar Conversion Tables for 1901-2100 into CACHE_DIR (skipping
files already there), checks every day against them, writes test/data/chinese-months.json, and prints the table
rows to paste into lunar.ts and Lunar.kt. Copy chinese-months.json to the app's app/src/test/resources too.

    python scripts/build_lunar_table.py CACHE_DIR

Table format, one entry per lunar year 1901-2099: bits 0-3 = the leap month (0 = none); bit 4+i = 1 if the
year's i-th month, counting the leap month, has 30 days. Lunar year 1901 starts on 19 February 1901.
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.request

URL = 'https://www.hko.gov.hk/en/gts/time/calendar/text/files/T{year}e.txt'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'test', 'data', 'chinese-months.json')


def download(cache):
    os.makedirs(cache, exist_ok=True)
    for year in range(1901, 2101):
        path = os.path.join(cache, f'T{year}e.txt')
        if not os.path.exists(path):
            request = urllib.request.Request(URL.format(year=year), headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=60) as response, open(path, 'wb') as f:
                f.write(response.read())


def read(cache):
    """Month starts as (date, month number), and the day of the lunar month for every date."""
    starts, days = [], {}
    line = re.compile(r'^(\d{4})/(\d{1,2})/(\d{1,2})\s+(\S+)')
    for year in range(1901, 2101):
        with open(os.path.join(cache, f'T{year}e.txt'), encoding='latin-1') as f:
            for text in f:
                m = line.match(text)
                if not m:
                    continue
                date = dt.date(int(m[1]), int(m[2]), int(m[3]))
                month = re.match(r'(\d+)(?:st|nd|rd|th)', m[4])
                # A month's first day reads "8th Lunar Month"; a leap month repeats the number before it.
                if month and re.search(r'lunar month', text, re.I):
                    starts.append((date, int(month[1])))
                    days[date] = 1
                else:
                    days[date] = int(m[4])
    return starts, days


def build(starts):
    years = []  # (new year's day, [(month, leap, first day)])
    for date, month in starts:
        if month == 1 and (not years or years[-1][1][-1][0] != 1):
            years.append((date, []))
        if years:  # skip the end of lunar year 1900
            months = years[-1][1]
            months.append((month, bool(months) and months[-1][0] == month, date))
    table = []
    for index, (new_year, months) in enumerate(years):
        if new_year.year > 2099:
            break
        ends = [m[2] for m in months[1:]] + [years[index + 1][0]]
        lengths = [(end - m[2]).days for m, end in zip(months, ends)]
        assert all(length in (29, 30) for length in lengths), (new_year, lengths)
        value = next((m for m, leap, _ in months if leap), 0)
        for i, length in enumerate(lengths):
            if length == 30:
                value |= 1 << (4 + i)
        table.append(value)
    assert years[0][0] == dt.date(1901, 2, 19)
    return table


def decode(table):
    """date -> (month, leap, day) for every day the table covers."""
    out, day = {}, dt.date(1901, 2, 19)
    for value in table:
        leap_month, month = value & 0xF, 0
        for i in range(13 if leap_month else 12):
            leap = leap_month != 0 and i == leap_month
            month += 0 if leap else 1
            for d in range(1, (30 if value & (1 << (4 + i)) else 29) + 1):
                out[day] = (month, leap, d)
                day += dt.timedelta(days=1)
    return out


def main():
    cache = sys.argv[1]
    download(cache)
    starts, days = read(cache)
    table = build(starts)
    decoded = decode(table)
    wrong = [d for d, (_, _, n) in decoded.items() if days.get(d) != n]
    assert not wrong, f'{len(wrong)} days differ from the Observatory, first {wrong[0]}'
    print(f'{len(table)} lunar years, {len(decoded)} days, all matching the Observatory')
    months = [[d.isoformat(), m, leap] for d, (m, leap, n) in decoded.items() if n == 1]
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('[\n' + ',\n'.join('\t' + json.dumps(m) for m in months) + '\n]\n')
    print(f'Wrote {len(months)} month starts to {os.path.normpath(OUT)}')
    for i in range(0, len(table), 10):
        print(', '.join('0x%05x' % v for v in table[i:i + 10]) + ',  // %d' % (1901 + i))


if __name__ == '__main__':
    main()
