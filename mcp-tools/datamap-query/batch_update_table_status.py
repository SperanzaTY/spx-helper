#!/usr/bin/env python3
"""
批量更新 DataMap 表状态为 MIGRATED。
从 Migration List Google Sheet 提取的唯一表列表。

用法:
    python batch_update_table_status.py [--dry-run]

默认 dry-run 模式，仅预览。去掉 --dry-run 参数执行实际更新。
"""

import json
import os
import sys
import time
import requests
from chrome_auth import get_auth

DOMAIN = "datasuite.shopee.io"
BASE_URL = f"https://{DOMAIN}"
API_PREFIX = "/datamap/api/v3"

OPEN_API_BASE = "https://open-api.datasuite.shopee.io"

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/137.0.0.0 Safari/537.36"
    ),
}

TABLES = [
    "shopee_ssc_spx_locker_tw_db__sp_locker_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_locker_tw_db__locker_box_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_rjt_br_db__sort_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__staging_area_config_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__inbound_staging_area_mapping_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__staging_group_tab__reg_continuous_s0_live",
    "shopee_service_point_tw_db__service_point_extend_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__cage_mapping_tab__reg_continuous_s0_live",
    "shopee_line_haul_network_br_db__transportation_trip_change_record_tab__reg_continuous_s0_live",
    "shopee_line_haul_network_th_db__transportation_onsite_registration_tab__reg_continuous_s0_live",
    "shopee_line_haul_network_th_db__transportation_booking_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_networkroute_br_db__sorting_plan_v1_tab__reg_daily_s0_live",
    "shopee_spx_basic_tw_db__seller_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__vehicle_queue_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__vehicle_queue_operation_log_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__dock_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__dock_log_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__staging_area_config_to_destination_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__inbound_staging_area_mapping_history_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_sp8_br_db__asm_account_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_br_db__outbound_staging_area_details_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_sp8_br_db__chute_event_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_sp8_br_db__device_tab__reg_continuous_s0_live",
    "shopee_line_haul_network_id_db__transportation_onsite_registration_tab__reg_continuous_s0_live",
    "shopee_line_haul_network_id_db__transportation_booking_tab__reg_continuous_s0_live",
    "shopee_line_haul_network_id_db__transportation_onsite_registration_route_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_sp8_br_db__pack_task_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_sp8_br_db__pack_task_tab_archive__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_sp8_br_db__sort_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_sp8_br_db__sort_tab_archive__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_rjt_br_db__asm_account_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_rjt_br_db__chute_event_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_th_db__vehicle_queue_tab__reg_continuous_s0_live",
    "shopee_spx_driver_mgt_vn_db__ops_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_rjt_br_db__pack_task_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_rjt_br_db__pack_task_tab_archive__reg_continuous_s0_live",
    "shopee_line_haul_network_ph_db__transportation_onsite_registration_tab__reg_continuous_s0_live",
    "shopee_spx_workforce_ph_db__attendance_clock_record_statistic_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_rjt_br_db__device_tab__reg_continuous_s0_live",
    "shopee_ssc_spx_wcs_rjt_br_db__sort_tab_archive__reg_continuous_s0_live",
    "shopee_line_haul_network_my_db__transportation_booking_tab__reg_continuous_s0_live",
    "shopee_line_haul_network_my_db__transportation_onsite_registration_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_ph_db__vehicle_queue_tab__reg_continuous_s0_live",
    "shopee_spx_in_station_ph_db__vehicle_queue_operation_log_tab__reg_continuous_s0_live",
    "shopee_line_haul_network_ph_db__transportation_booking_tab__reg_continuous_s0_live",
]

SCHEMA = "spx_mart"
TARGET_STATUS = "MIGRATED"


def load_cookies(force=False):
    result = get_auth(DOMAIN, force=force)
    if not result.ok:
        print(f"[ERROR] Cookie 加载失败: {result}")
        sys.exit(1)
    print(f"[OK] Cookie 加载成功 via {result.source} ({len(result.cookies)} cookies)")
    return result.cookies


def get_table_status(cookies, table_name, retry_count=0):
    qn = f"hive@prod@{SCHEMA}@{table_name}"
    url = f"{BASE_URL}{API_PREFIX}/dataWarehouse/HIVE/info"
    headers = HEADERS.copy()
    headers["referer"] = f"{BASE_URL}/datamap"
    if "CSRF-TOKEN" in cookies:
        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]

    resp = requests.get(url, params={"qualifiedName": qn}, cookies=cookies, headers=headers, timeout=30)
    if resp.status_code in (401, 403) and retry_count < 2:
        print(f"    -> {resp.status_code}, refreshing cookies...")
        new_cookies = load_cookies(force=True)
        cookies.update(new_cookies)
        return get_table_status(cookies, table_name, retry_count + 1)
    if resp.status_code != 200:
        return f"ERROR({resp.status_code})"
    body = resp.json()
    if isinstance(body, dict) and "data" in body:
        data = body["data"]
        if isinstance(data, dict):
            return data.get("tableStatus", "UNKNOWN")
    return "UNKNOWN"


def update_table_status_via_open_api(table_name, token):
    url = f"{OPEN_API_BASE}{API_PREFIX}/system/hive/updateTableInfo"
    payload = {
        "idcRegion": "SG",
        "schema": SCHEMA,
        "table": table_name,
        "tableStatus": TARGET_STATUS,
    }
    headers = {"Content-Type": "application/json", "Authorization": token}
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code >= 400:
        return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
    body = resp.json()
    if isinstance(body, dict) and "success" in body:
        if not body["success"]:
            return False, body.get("msg", body.get("message", str(body)))
        return True, "OK"
    return True, str(body)


def update_table_status_via_cookie(cookies, table_name):
    """Try updating via cookie-based API (same as web UI)."""
    qn = f"hive@prod@{SCHEMA}@{table_name}"
    url = f"{BASE_URL}{API_PREFIX}/dataWarehouse/HIVE/updateStatus"
    headers = HEADERS.copy()
    headers["referer"] = f"{BASE_URL}/datamap"
    if "CSRF-TOKEN" in cookies:
        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]

    payload = {"qualifiedName": qn, "tableStatus": TARGET_STATUS}
    resp = requests.post(url, json=payload, cookies=cookies, headers=headers, timeout=30)
    if resp.status_code >= 400:
        return False, f"HTTP {resp.status_code}"
    body = resp.json()
    if isinstance(body, dict) and "success" in body:
        if not body["success"]:
            return False, body.get("msg", body.get("message", str(body)))
        return True, "OK"
    return True, str(body)


def main():
    dry_run = "--dry-run" in sys.argv or len(sys.argv) == 1

    print(f"=== DataMap Table Status Batch Update ===")
    print(f"Target status: {TARGET_STATUS}")
    print(f"Total unique tables: {len(TABLES)}")
    print(f"Mode: {'DRY-RUN (preview only)' if dry_run else 'EXECUTE'}")
    print()

    cookies = load_cookies()

    open_api_token = os.environ.get("DATAMAP_OPEN_API_TOKEN", "")
    if open_api_token and not open_api_token.startswith("Basic "):
        open_api_token = f"Basic {open_api_token}"

    already_migrated = []
    needs_update = []
    errors = []

    print("--- Step 1: Checking current status ---")
    for i, table in enumerate(TABLES):
        status = get_table_status(cookies, table)
        label = f"[{i+1}/{len(TABLES)}]"
        if status == TARGET_STATUS:
            print(f"  {label} {table}: already {status}")
            already_migrated.append(table)
        elif status.startswith("ERROR"):
            print(f"  {label} {table}: {status}")
            errors.append((table, status))
        else:
            print(f"  {label} {table}: {status} -> {TARGET_STATUS}")
            needs_update.append(table)

    print()
    print(f"--- Summary ---")
    print(f"  Already MIGRATED: {len(already_migrated)}")
    print(f"  Needs update:     {len(needs_update)}")
    print(f"  Errors:           {len(errors)}")
    print()

    if dry_run:
        print("[DRY-RUN] No changes made. Run with --execute to apply changes.")
        if needs_update:
            print("\nTables that will be updated:")
            for t in needs_update:
                print(f"  - spx_mart.{t}")
        return

    if not needs_update:
        print("Nothing to update!")
        return

    print(f"--- Step 2: Updating {len(needs_update)} tables ---")
    success_count = 0
    fail_count = 0

    for i, table in enumerate(needs_update):
        label = f"[{i+1}/{len(needs_update)}]"

        if open_api_token:
            ok, msg = update_table_status_via_open_api(table, open_api_token)
        else:
            ok, msg = update_table_status_via_cookie(cookies, table)

        if ok:
            print(f"  {label} {table}: {msg}")
            success_count += 1
        else:
            print(f"  {label} {table}: FAILED - {msg}")
            fail_count += 1

        time.sleep(0.5)

    print()
    print(f"--- Results ---")
    print(f"  Success: {success_count}")
    print(f"  Failed:  {fail_count}")


if __name__ == "__main__":
    main()
